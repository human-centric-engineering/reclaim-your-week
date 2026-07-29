'use client';

/**
 * The offer, read off the stream.
 *
 * The coach names the reading its question is about by calling `offer_choices`
 * (`lib/app/programme/coach/capabilities/offer-choices.ts`), and the platform yields every tool
 * result to the client as a `capability_result` frame — unconditionally, with only the admin `trace`
 * gated behind `includeTrace`. The run's own stream route pipes each frame through verbatim. So the
 * offer reaches the conversation on the wire it was already on, with nothing added to the transport
 * and nothing parsed out of the coach's prose.
 *
 * **Validated rather than trusted, even though this one came from our own capability.** The frame is
 * external data by the time it is read here, and the rule against casting it does not soften because
 * of where we believe it came from. A frame that fails to parse yields `null`, the offer simply does
 * not appear, and the leader is left with the text box they would have had before any of this
 * existed. That is the correct failure: an offer is a convenience over a composer that works.
 */

import { z } from 'zod';
import type { ChatStreamEvent } from '@/components/admin/orchestration/chat/chat-events';
import { RECLAIM_OFFER_CHOICES_SLUG } from '@/lib/app/programme/agent';

/**
 * The most answers the screen will draw.
 *
 * Nothing authored comes close (six roles is the longest), so this is a guard rather than a policy:
 * a set that somehow arrived long enough to fill the composer would push the question off the top of
 * it. The offer is dropped whole rather than truncated, because half a set of answers is worse than
 * none: a leader who cannot see the option they want and does not know one is missing will pick the
 * nearest wrong thing.
 */
const MAX_OPTIONS = 8;

/** Long enough for "Established business", short enough that a sentence is not a button. */
const MAX_OPTION_LENGTH = 60;

/** One offer, as the composer draws it. */
export interface ChoiceOffer {
  slotSlug: string;
  /** The reading's leader-facing name, for the control's accessible label. Never a slug. */
  label: string;
  options: string[];
}

/** The capability's success envelope, as it arrives on the frame. */
const offerSchema = z.object({
  success: z.literal(true),
  data: z.object({
    slotSlug: z.string().min(1),
    label: z.string().min(1),
    options: z
      .array(z.string().trim().min(1).max(MAX_OPTION_LENGTH))
      .min(2)
      .max(MAX_OPTIONS)
      // Two buttons reading the same word is a choice with a wrong answer in it, and the leader
      // cannot tell which one the audit will hear.
      .refine((options) => new Set(options).size === options.length),
  }),
});

/**
 * The offer carried by this frame, or `null` for every other frame on the stream.
 *
 * A refusal (`success: false`) also returns `null`, and deliberately so: the capability refuses when
 * the reading has no answer set or belongs to another section, both of which mean there is nothing to
 * draw. The coach is told why on its own next iteration, which is the only place that information is
 * useful.
 */
export function offerFromEvent(event: ChatStreamEvent): ChoiceOffer | null {
  const results =
    event.type === 'capability_result'
      ? [{ capabilitySlug: event.capabilitySlug, result: event.result }]
      : event.type === 'capability_results'
        ? event.results
        : [];

  // Last wins. A turn that offered twice asked twice, and what belongs under the composer is the
  // answer set for the question the leader has just finished reading.
  let offer: ChoiceOffer | null = null;
  for (const entry of results) {
    if (entry.capabilitySlug !== RECLAIM_OFFER_CHOICES_SLUG) continue;
    const parsed = offerSchema.safeParse(entry.result);
    if (parsed.success) offer = parsed.data.data;
  }
  return offer;
}
