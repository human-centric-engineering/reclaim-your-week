/**
 * The completion email (F15 t-3) — the one message a finished audit sends.
 *
 * **Not registered in `lib/app/emails.ts`, and it cannot be.** `EmailPropsMap` is a closed interface
 * of four auth kinds, so a leaf can override an email but not add one (sunrise#468). `sendEmail`
 * takes any React element, so this renders directly, exactly as `quarterly-nudge.tsx` does.
 *
 * ## This is not P13, and the copy is where that shows
 *
 * P13 parks the **follow-up email sequence** Brief §2 asks for. This is one transactional message
 * about a document the leader has just made, and it is a different thing: no cadence, nothing to
 * respond to, and no second message behind it.
 *
 * Keeping it that way is entirely a matter of what it does **not** say, because I16 rules out almost
 * everything a completion email normally does:
 *
 * - **No next step.** No booking link, no consultation offer, no "here is what to do with this". The
 *   consultation is offered once, on the closing screen, where the leader is already looking at
 *   their own summary and can take it or not. Repeating it in an inbox turns an offer into a pitch.
 * - **No second audit.** The quarterly nudge exists and is deliberately the only prompt to return.
 * - **No results in the body.** Their hours, their gaps and their pathway stay behind a sign-in.
 *   Restating a figure here would put the audit's contents into a channel they did not choose for it,
 *   and an interpretation into an inbox (I12) is worse than one on a screen they opened.
 * - **No urgency, no expiry, no "before you forget".** The record is theirs for as long as they want
 *   it, and the email says so rather than implying a deadline.
 *
 * What is left is: it is finished, here is where it lives, you can take a copy. That is the whole
 * message, and the restraint is the design rather than a first draft waiting to be filled in.
 *
 * ## Why the link is login-gated
 *
 * It goes to `/programme/history/<runId>`, not to a tokenised URL and not to an attached PDF. The
 * report carries their role, their hours, what they said their priorities were and, since the
 * analyst was allowed to read the audit, a reading written from what they said in it. A sign-in is
 * the correct friction for that.
 *
 * **There is no longer a tokenised URL to weigh this against.** The public share link had no expiry
 * and no revoke, and it has been removed rather than kept for the case where a leader chose it
 * (`lib/app/programme/share.ts`). This paragraph used to call it a fair trade for a summary somebody
 * published deliberately; the report is a different document now, and nothing publishes it.
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

export interface AuditCompleteEmailProps {
  /** First name where the audit captured one; the greeting falls back rather than saying "there". */
  firstName: string | null;
  /** The leader's own finished audit, behind a sign-in. */
  summaryUrl: string;
}

export default function AuditCompleteEmail({
  firstName,
  summaryUrl,
}: AuditCompleteEmailProps): React.ReactElement {
  return (
    <Html lang="en">
      <Head />
      <Preview>Your time audit is finished, and it is yours to keep</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{BRAND.name}</Heading>

          <Text style={text}>{firstName ? `Hello ${firstName},` : 'Hello,'}</Text>

          <Text style={text}>
            You have finished your audit. That took real attention, and what came out of it is a
            picture of your working life in your own words and your own figures.
          </Text>

          <Text style={text}>
            It lives in your account, and it stays there. You can read it whenever you like and
            download a copy to keep, print or pass on.
          </Text>

          <Section style={buttonContainer}>
            <Button href={summaryUrl} style={button}>
              Open your audit
            </Button>
          </Section>

          <Section style={reassuranceBox}>
            <Text style={reassuranceText}>
              Nothing here needs doing. The work was the looking, and you have done it.
            </Text>
          </Section>

          <Hr style={hr} />

          <Text style={footer}>
            {BRAND.name} is a guided time audit designed by Rashmir Balasubramaniam.
          </Text>

          <Text style={footer}>
            You are getting this because you finished an audit. It is the only message sent when one
            is completed.
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
  lineHeight: '26px',
  margin: '0 0 18px',
  padding: '0 48px',
};

const buttonContainer: React.CSSProperties = {
  padding: '12px 48px 20px',
};

const button: React.CSSProperties = {
  backgroundColor: '#0D4F68',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 500,
  textDecoration: 'none',
  textAlign: 'center',
  display: 'inline-block',
  padding: '13px 26px',
};

const reassuranceBox: React.CSSProperties = {
  backgroundColor: '#F6F5EC',
  borderRadius: '6px',
  margin: '8px 48px 24px',
  padding: '16px 20px',
};

const reassuranceText: React.CSSProperties = {
  color: '#3B4A52',
  fontSize: '15px',
  lineHeight: '24px',
  margin: 0,
};

const hr: React.CSSProperties = {
  borderColor: '#E3E8EA',
  margin: '20px 48px',
};

const footer: React.CSSProperties = {
  color: '#66787F',
  fontSize: '13px',
  lineHeight: '20px',
  margin: '0 0 12px',
  padding: '0 48px',
};
