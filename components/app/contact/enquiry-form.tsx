'use client';

/**
 * The public enquiry form.
 *
 * ## Why this exists instead of `components/forms/contact-form.tsx`
 *
 * The platform form is Sunrise's (name / email / free-text subject / message) and is not ours to
 * edit (I10). This one asks the question the platform form cannot: **what is this about?** The four
 * answers are the four real reasons someone writes here, and one of them, an invitation, is the only
 * route into an invite-only audit.
 *
 * ## The tick boxes carry the routing, and the subject line carries them
 *
 * `POST /api/v1/contact` is a core route with a fixed body (`name`, `email`, `subject`, `message`,
 * plus the honeypot), and `ContactSubmission` is a core model. Adding a column for "wants an
 * invitation" would mean editing `prisma/schema/app.prisma`, which is Sunrise's despite the name.
 * So the ticks are composed into the **subject** — "Invitation request · Coaching enquiry" — which
 * is what the notification email leads with and what the admin list shows. Nothing about the request
 * is lost, no lower tier is touched, and the message stays exactly the words the person wrote.
 *
 * ## No pressure, and nothing required
 *
 * Ticking nothing is fine and sends a general enquiry. The boxes are unticked by default and none is
 * validated (Brief §2, I16 — the product does not push anyone toward a next step, and a form that
 * refuses to send until you declare an intent is a push).
 */

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { contactSchema } from '@/lib/validations/contact';
import { apiClient, APIClientError } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';
import { FormError } from '@/components/forms/form-error';
import { useFormAnalytics } from '@/lib/analytics/events';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

/**
 * The platform's rules for name / email / message, unchanged — the subject is dropped because this
 * form composes it, and the honeypot is carried through untouched so the core route's bot check
 * still bites.
 */
const enquirySchema = contactSchema.omit({ subject: true }).extend({
  topics: z.object({
    invitation: z.boolean(),
    coaching: z.boolean(),
    support: z.boolean(),
    data: z.boolean(),
  }),
  website: z.string().optional(),
});

type EnquiryInput = z.infer<typeof enquirySchema>;

interface Topic {
  id: keyof EnquiryInput['topics'];
  label: string;
  /** What a tick contributes to the composed subject line. */
  subject: string;
}

/** Order matters: the way in comes first, because for most people that is why they are here. */
const TOPICS: readonly Topic[] = [
  {
    id: 'invitation',
    label: 'I would like an invitation to Reclaim Your Week.',
    subject: 'Invitation request',
  },
  {
    id: 'coaching',
    label: 'I am interested in working with Rashmir.',
    subject: 'Coaching enquiry',
  },
  {
    id: 'support',
    label: 'I have a question about the audit, or something is not working.',
    subject: 'Question about the audit',
  },
  {
    id: 'data',
    label: 'This is about my data: a copy, a correction, or deletion.',
    subject: 'Data request',
  },
];

const NO_TOPIC_SUBJECT = 'General enquiry';

/** Composed rather than typed, so the recipient sees the routing before opening the message. */
function composeSubject(topics: EnquiryInput['topics']): string {
  const chosen = TOPICS.filter((topic) => topics[topic.id]);
  return chosen.length > 0 ? chosen.map((topic) => topic.subject).join(' · ') : NO_TOPIC_SUBJECT;
}

export function EnquiryForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentInvitationRequest, setSentInvitationRequest] = useState<boolean | null>(null);
  const { trackFormSubmitted } = useFormAnalytics();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EnquiryInput>({
    resolver: zodResolver(enquirySchema),
    mode: 'onTouched',
    defaultValues: {
      name: '',
      email: '',
      message: '',
      website: '',
      topics: { invitation: false, coaching: false, support: false, data: false },
    },
  });

  const onSubmit = async (data: EnquiryInput) => {
    try {
      setIsLoading(true);
      setError(null);

      await apiClient.post(API.PUBLIC.CONTACT, {
        body: {
          name: data.name,
          email: data.email,
          subject: composeSubject(data.topics),
          message: data.message,
          website: data.website,
        },
      });

      void trackFormSubmitted('contact');

      setSentInvitationRequest(data.topics.invitation);
      reset();
    } catch (err) {
      // The core route answers a tripped rate limit with a real message; show it rather than
      // flattening every failure into "something went wrong".
      setError(
        err instanceof APIClientError
          ? err.message
          : 'That did not send. Please try again in a moment.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (sentInvitationRequest !== null) {
    return (
      <div className="border-primary/25 max-w-2xl border-l pl-6" role="status">
        <p className="text-foreground text-lg leading-relaxed font-light">
          Thank you. Your message has been sent.
        </p>
        <p className="text-muted-foreground mt-4 leading-relaxed font-light">
          {sentInvitationRequest
            ? 'Invitations are issued by hand rather than by a queue, so a reply may take a few days. There is nothing else you need to do in the meantime.'
            : 'A reply usually comes within a few working days.'}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="max-w-2xl space-y-8">
      {/* Honeypot. Invisible to people, attractive to bots, checked server-side. */}
      <div className="absolute -left-[9999px] opacity-0" aria-hidden="true">
        <label htmlFor="website">Website (leave blank)</label>
        <input type="text" id="website" tabIndex={-1} autoComplete="off" {...register('website')} />
      </div>

      <fieldset>
        <legend className="text-muted-foreground text-[0.72rem] font-medium tracking-[0.2em] uppercase">
          What is this about? Tick any, or none.
        </legend>
        <div className="space-y-3 pt-4">
          {TOPICS.map((topic) => (
            <label
              key={topic.id}
              className="text-foreground flex cursor-pointer items-start gap-3 text-[0.95rem] leading-relaxed font-light"
            >
              <input
                type="checkbox"
                className="mt-1"
                disabled={isLoading}
                {...register(`topics.${topic.id}`)}
              />
              <span>{topic.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name" className="font-normal">
            Your name
          </Label>
          <Input
            id="name"
            type="text"
            autoComplete="name"
            disabled={isLoading}
            {...register('name')}
          />
          <FormError message={errors.name?.message} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email" className="font-normal">
            Your email
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            disabled={isLoading}
            {...register('email')}
          />
          <FormError message={errors.email?.message} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="message" className="font-normal">
          Your message
        </Label>
        <Textarea
          id="message"
          placeholder="A few lines is plenty."
          className="min-h-[160px] resize-y"
          disabled={isLoading}
          {...register('message')}
        />
        <FormError message={errors.message?.message} />
      </div>

      {error !== null && <FormError message={error} />}

      <button
        type="submit"
        disabled={isLoading}
        className="bg-primary text-primary-foreground rounded-full px-8 py-3 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {isLoading ? 'Sending…' : 'Send'}
      </button>
    </form>
  );
}
