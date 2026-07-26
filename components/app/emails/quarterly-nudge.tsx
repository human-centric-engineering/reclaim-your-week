/**
 * The quarterly nudge (F9 t-3) — the one email this product sends unprompted.
 *
 * **Not registered in `lib/app/emails.ts`, and it cannot be.** `EmailPropsMap` (`lib/email/registry.ts`)
 * is a closed interface of four auth kinds, so a leaf can *override* an email but not *add* one. The
 * machinery beneath is generic — `sendEmail` takes any React element — so this renders directly.
 * Filed as sunrise#468; it is the third closed-enum finding in three features.
 *
 * ## The copy is the work, and the constraint is I16
 *
 * Brief §2 asks for **no pressure on next steps anywhere in the product**, and Rashmir's answer on
 * nudges was "gentle and quarterly rather than frequent". A nudge is structurally pressure, so
 * everything here is shaped to be the least of it:
 *
 * - It states a fact ("about three months ago") and opens a door. It does not say they are slipping,
 *   does not estimate what has drifted, and does not pitch anything.
 * - It never guesses at their results. Telling someone their deep-work hours were low last quarter is
 *   an interpretation (I12) delivered to their inbox, which is worse than on a screen they chose.
 * - **Opting out is in the body, not buried in a footer**, and takes one click with no login. A
 *   leader who has stopped using the product must not have to get back into it to make this stop.
 * - It is attributed to Rashmir in the third person and never speaks as her (I1). No em dashes (I2).
 *
 * Colours follow the confirmed brand direction, matching `invitation.tsx`.
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

export interface QuarterlyNudgeEmailProps {
  /** First name where we have one — the greeting falls back rather than saying "Hello there". */
  firstName: string | null;
  /** Where a new audit starts. */
  programmeUrl: string;
  /** One click, no session. */
  unsubscribeUrl: string;
}

export default function QuarterlyNudgeEmail({
  firstName,
  programmeUrl,
  unsubscribeUrl,
}: QuarterlyNudgeEmailProps): React.ReactElement {
  return (
    <Html lang="en">
      <Head />
      <Preview>Your last time audit was about three months ago</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{BRAND.name}</Heading>

          <Text style={text}>{firstName ? `Hello ${firstName},` : 'Hello,'}</Text>

          <Text style={text}>
            It has been about three months since you last looked at where your week goes. Some
            leaders find that a useful rhythm, so this is a note to say the door is open if you want
            to look again.
          </Text>

          <Text style={text}>
            A second audit sits alongside your first, so you can see what has changed and what has
            not. There is no right answer to that, and nothing to catch up on.
          </Text>

          <Section style={buttonContainer}>
            <Button href={programmeUrl} style={button}>
              Look at this quarter
            </Button>
          </Section>

          <Section style={reassuranceBox}>
            <Text style={reassuranceText}>
              If now is not the time, that is genuinely fine. This is the only reminder you will get
              about your last audit.
            </Text>
          </Section>

          <Hr style={hr} />

          <Text style={footer}>
            {BRAND.name} is a guided time audit designed by Rashmir Balasubramaniam.
          </Text>

          <Text style={footer}>
            Would you rather not have these?{' '}
            <a href={unsubscribeUrl} style={link}>
              Turn them off
            </a>
            . It takes one click and you do not need to sign in.
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

const link: React.CSSProperties = {
  color: '#0D4F68',
  textDecoration: 'underline',
};
