/**
 * Reclaim Your Week's invitation email (F8 t-1) — a leaf **override** of the platform default.
 *
 * Registered in `lib/app/emails.ts` for the `invitation` kind, so it replaces `emails/invitation.tsx`
 * without editing it (I10). The props contract is Sunrise's `EmailPropsMap['invitation']`.
 *
 * The copy is the work here, not the markup. This is the first thing an invited leader ever reads from
 * the product, and the platform default ("We're excited to have you on board!", "Start collaborating
 * with your team") is the wrong register entirely. Brief §7 sets the right one: calm, uncluttered,
 * reassuring — "it is okay if you are not using your time optimally yet; this is not about achieving a
 * perfect calendar; it is better to know; no one is judging you."
 *
 * **The tool is not Rashmir (I1).** The invitation is attributed to her in the third person; it does
 * not speak as her. It also does not promise a productivity win (I-frame): the audit is an invitation
 * to lead differently, which may mean letting go.
 *
 * Colours follow the confirmed brand direction (deep teal `#0D4F68`, cream `#CCC69B`, generous white
 * space, no gradients — plan.md decisions log, 2026-07-24). Inline styles throughout, as email demands.
 */

import * as React from 'react';
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Text,
  Button,
  Hr,
  Heading,
} from '@react-email/components';
import { BRAND } from '@/lib/brand';

interface InvitationEmailProps {
  inviterName: string;
  inviteeName: string;
  inviteeEmail: string;
  invitationUrl: string;
  expiresAt: Date;
}

export default function ReclaimInvitationEmail({
  inviteeName,
  inviteeEmail,
  invitationUrl,
  expiresAt,
}: InvitationEmailProps): React.ReactElement {
  const expiryDate = new Date(expiresAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <Html lang="en">
      <Head />
      <Preview>An invitation to look honestly at where your week goes</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{BRAND.name}</Heading>

          <Text style={text}>Hello {inviteeName},</Text>

          <Text style={text}>
            You have been invited to try {BRAND.name}, a guided time audit designed by Rashmir
            Balasubramaniam for leaders who are carrying more than they can sustain.
          </Text>

          <Text style={text}>
            It takes about an hour, in one sitting or several. It asks how your week is actually
            spent, draws it back to you, and helps you decide what to do with what you see. The
            decisions stay with you.
          </Text>

          <Section style={buttonContainer}>
            <Button href={invitationUrl} style={button}>
              Start your audit
            </Button>
          </Section>

          <Section style={reassuranceBox}>
            <Text style={reassuranceText}>
              It is fine to do this during an atypical week. It is not about achieving a perfect
              calendar, and no one is judging how you spend your time. It is better to know.
            </Text>
          </Section>

          <Text style={text}>
            This invitation is for {inviteeEmail} and is valid until {expiryDate}.
          </Text>

          <Hr style={hr} />

          <Text style={footer}>
            If the button does not work, copy this link into your browser:
            <br />
            <a href={invitationUrl} style={link}>
              {invitationUrl}
            </a>
          </Text>

          <Text style={footer}>
            If you were not expecting this invitation, you can safely ignore this email and nothing
            will be created for you.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main: React.CSSProperties = {
  backgroundColor: '#f7fafc',
  fontFamily:
    "'Raleway', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
};

const container: React.CSSProperties = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '32px 0 48px',
  marginBottom: '64px',
  maxWidth: '580px',
};

const h1: React.CSSProperties = {
  color: '#0D4F68',
  fontSize: '26px',
  fontWeight: 600,
  lineHeight: '36px',
  margin: '0 0 28px',
  padding: '0 48px',
  letterSpacing: '-0.2px',
};

const text: React.CSSProperties = {
  color: '#112C36',
  fontSize: '16px',
  lineHeight: '28px',
  margin: '18px 0',
  padding: '0 48px',
};

const buttonContainer: React.CSSProperties = {
  padding: '20px 48px 8px',
};

const button: React.CSSProperties = {
  backgroundColor: '#0D4F68',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 600,
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '14px 30px',
};

const reassuranceBox: React.CSSProperties = {
  backgroundColor: '#F4F2E4',
  borderLeft: '3px solid #CCC69B',
  borderRadius: '4px',
  margin: '28px 48px',
  padding: '16px 20px',
};

const reassuranceText: React.CSSProperties = {
  color: '#665E25',
  fontSize: '15px',
  lineHeight: '26px',
  margin: '0',
};

const hr: React.CSSProperties = {
  borderColor: '#e6ebf1',
  margin: '32px 0',
};

const footer: React.CSSProperties = {
  color: '#5b7280',
  fontSize: '14px',
  lineHeight: '24px',
  margin: '14px 0',
  padding: '0 48px',
};

const link: React.CSSProperties = {
  color: '#0D4F68',
  textDecoration: 'underline',
  wordBreak: 'break-all' as const,
};
