/**
 * Reclaim Your Week's welcome email — a leaf **override** of the platform default.
 *
 * Registered in `lib/app/emails.ts` for the `welcome` kind, so it replaces `emails/welcome.tsx`
 * without editing it (I10). The props contract is Sunrise's `EmailPropsMap['welcome']`.
 *
 * **What the platform default said.** "Reclaim Your Week is your production-ready Next.js starter
 * template designed for rapid application development", over a Get Started button to `/dashboard`.
 * Starter-template copy, addressed to a developer, going to leaders. It survived ten features because
 * `lib/app/emails.ts` overrides only the kinds someone thought to override, and nobody reads an email
 * they are not sent. Found 2026-07-26, alongside the missing nav link that left the same leaders with
 * nowhere to go once they arrived.
 *
 * **Its job is re-entry, not a second pitch.** Read `lib/auth/config.ts`: for an accepted invitation
 * (`isPasswordInvitation`) this sends *immediately* after the password is set, so it lands moments
 * after the invitation email and while the leader is already inside. Re-explaining the audit here
 * would be the third time of asking. What it is actually for is the day three weeks later when they
 * want to pick the audit back up and go looking for the way in. So: the account exists, this is the
 * address it is under, here is the door, and coming back later is fine.
 *
 * That last point is not filler. Brief §7's register is reassurance, and the specific reassurance
 * this moment needs is that stopping partway is not failure. An audit that takes an hour will often
 * be abandoned at twenty minutes, and the leader who believes they have blown it does not return.
 *
 * **Voice (I1, I2).** Third-person attribution to Rashmir, never speaking as her. No vendor-we: the
 * platform's "We're excited to have you on board" is exactly the construction rule 2 forbids. No em
 * dash, no banned lexicon. No promise of a productivity win (I-frame) — the audit may well conclude
 * that something has to be let go of, and an email that promised a tidier calendar would have
 * mis-sold it.
 *
 * **The button goes to `appAuthLandingRoute`, not a literal.** That is the seam this app already sets
 * (`lib/app/auth-landing.ts`, sunrise#473); hardcoding `/dashboard` here is precisely the bug that
 * stranded the first cohort, and hardcoding `/programme` instead would just be the same mistake with
 * better aim.
 *
 * Colours follow `invitation.tsx`, which follows the confirmed brand direction (deep teal `#0D4F68`,
 * cream `#CCC69B`, generous white space, no gradients). Inline styles throughout, as email demands.
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
import { appAuthLandingRoute } from '@/lib/app/auth-landing';

interface WelcomeEmailProps {
  userName: string;
  userEmail: string;
  /** Base URL of the application (e.g., "https://example.com") */
  baseUrl: string;
}

export default function ReclaimWelcomeEmail({
  userName,
  userEmail,
  baseUrl,
}: WelcomeEmailProps): React.ReactElement {
  const auditUrl = `${baseUrl}${appAuthLandingRoute}`;

  return (
    <Html lang="en">
      <Head />
      <Preview>Your audit is ready when you are</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{BRAND.name}</Heading>

          <Text style={text}>Hello {userName},</Text>

          <Text style={text}>
            Your account is set up, and your audit is waiting whenever you have the time for it.
          </Text>

          <Text style={text}>
            It takes about an hour. It asks how your week is actually spent, draws that back to you,
            and helps you decide what to do with what you see. The decisions stay with you, and
            nothing is shared without your say.
          </Text>

          <Section style={buttonContainer}>
            <Button href={auditUrl} style={button}>
              Go to your audit
            </Button>
          </Section>

          <Section style={reassuranceBox}>
            <Text style={reassuranceText}>
              There is no need to finish in one sitting. The audit remembers where you stopped, and
              picking it up a week later costs you nothing. It is better to know, whenever you get
              there.
            </Text>
          </Section>

          <Text style={text}>
            The audit is a tool designed by Rashmir Balasubramaniam for leaders carrying more than
            they can sustain. It is kept under {userEmail}, so signing in with that address will
            always bring you back to it.
          </Text>

          <Hr style={hr} />

          <Text style={footer}>
            If the button does not work, copy this link into your browser:
            <br />
            <a href={auditUrl} style={link}>
              {auditUrl}
            </a>
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
