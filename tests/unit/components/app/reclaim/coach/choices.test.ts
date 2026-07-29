/**
 * Reading the offer off the stream.
 *
 * The interesting property here is not "does it find the field". It is that the frame is treated as
 * **external data even though our own capability produced it**: a malformed offer must yield `null`
 * and leave the leader the text box they would have had anyway, rather than reaching the composer
 * half-built. So most of what is asserted below is the shapes that get dropped — too few options,
 * options that repeat, an option long enough to be a sentence — and the fact that dropping one is
 * silent rather than throwing.
 *
 * The other property is `last wins` across a turn that offered twice, which is what puts the answer
 * set for the question the leader has just finished reading under the composer rather than the one
 * before it.
 */

import { describe, it, expect } from 'vitest';
import { offerFromEvent } from '@/components/app/reclaim/coach/choices';
import type { ChatStreamEvent } from '@/components/admin/orchestration/chat/chat-events';
import { RECLAIM_OFFER_CHOICES_SLUG } from '@/lib/app/programme/agent';

/** A success envelope as the capability emits it. */
const envelope = (data: unknown) => ({ success: true, data });

const singleFrame = (capabilitySlug: string, result: unknown): ChatStreamEvent => ({
  type: 'capability_result',
  capabilitySlug,
  result,
});

const validOffer = {
  slotSlug: 'reclaim_setup_audit_period',
  label: 'The period being audited',
  options: ['last week', 'last month', 'last quarter', 'last year'],
};

describe('offerFromEvent', () => {
  it('reads the offer off a single capability_result frame', () => {
    const offer = offerFromEvent(singleFrame(RECLAIM_OFFER_CHOICES_SLUG, envelope(validOffer)));

    expect(offer).toEqual(validOffer);
  });

  it('reads it off a batched capability_results frame too', () => {
    const offer = offerFromEvent({
      type: 'capability_results',
      results: [
        { capabilitySlug: 'reclaim_audit__read_answers', result: envelope({ answers: [] }) },
        { capabilitySlug: RECLAIM_OFFER_CHOICES_SLUG, result: envelope(validOffer) },
      ],
    });

    expect(offer).toEqual(validOffer);
  });

  it('takes the last offer of a turn, because that is the question just asked', () => {
    const second = { ...validOffer, slotSlug: 'reclaim_profile_role', label: 'Role' };
    const offer = offerFromEvent({
      type: 'capability_results',
      results: [
        { capabilitySlug: RECLAIM_OFFER_CHOICES_SLUG, result: envelope(validOffer) },
        { capabilitySlug: RECLAIM_OFFER_CHOICES_SLUG, result: envelope(second) },
      ],
    });

    expect(offer?.slotSlug).toBe('reclaim_profile_role');
  });

  it('ignores every other frame type on the stream', () => {
    expect(offerFromEvent({ type: 'content', delta: 'the coach speaking' })).toBeNull();
    expect(offerFromEvent({ type: 'done' })).toBeNull();
  });

  it('ignores another capability’s result, even a well-formed one', () => {
    expect(offerFromEvent(singleFrame('some_other_tool', envelope(validOffer)))).toBeNull();
  });

  it('drops a refusal, because a refusal means there is nothing to draw', () => {
    const offer = offerFromEvent(
      singleFrame(RECLAIM_OFFER_CHOICES_SLUG, {
        success: false,
        error: { code: 'no_choices', message: 'answered in their own words' },
      })
    );

    expect(offer).toBeNull();
  });

  it.each([
    ['fewer than two options', { ...validOffer, options: ['last week'] }],
    [
      'more than eight options',
      { ...validOffer, options: Array.from({ length: 9 }, (_, i) => `o${i}`) },
    ],
    ['a repeated option', { ...validOffer, options: ['last week', 'last week'] }],
    ['an option long enough to be a sentence', { ...validOffer, options: ['a'.repeat(61), 'b'] }],
    ['an empty option', { ...validOffer, options: ['', 'last month'] }],
    ['no label', { ...validOffer, label: '' }],
    ['no slug', { ...validOffer, slotSlug: '' }],
    ['options that are not strings', { ...validOffer, options: [1, 2] }],
    ['no data at all', undefined],
  ])('drops an offer with %s rather than half-drawing it', (_case, data) => {
    expect(offerFromEvent(singleFrame(RECLAIM_OFFER_CHOICES_SLUG, envelope(data)))).toBeNull();
  });

  it('drops a frame whose result is not an envelope at all', () => {
    expect(offerFromEvent(singleFrame(RECLAIM_OFFER_CHOICES_SLUG, 'not json'))).toBeNull();
    expect(offerFromEvent(singleFrame(RECLAIM_OFFER_CHOICES_SLUG, null))).toBeNull();
  });

  it('keeps an earlier valid offer when a later one is malformed', () => {
    // Last *valid* wins: a malformed second call must not blank the offer the leader can see, or a
    // model that called the tool twice and got one call wrong would take the answers away mid-turn.
    const offer = offerFromEvent({
      type: 'capability_results',
      results: [
        { capabilitySlug: RECLAIM_OFFER_CHOICES_SLUG, result: envelope(validOffer) },
        {
          capabilitySlug: RECLAIM_OFFER_CHOICES_SLUG,
          result: envelope({ ...validOffer, options: [] }),
        },
      ],
    });

    expect(offer).toEqual(validOffer);
  });
});
