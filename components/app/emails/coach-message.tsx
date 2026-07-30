/**
 * A message from the coach to one leader (F18 t-2) — the frame around words a human wrote.
 *
 * **The body is not ours.** Rashmir composes it on the client's record and every paragraph she typed
 * is rendered verbatim, split on blank lines, escaped by React like any other string. This component
 * contributes the envelope and nothing else: no added encouragement, no call to action of its own
 * beyond the door back into the audit, and no signature (hers is in the body she wrote).
 *
 * **Not registered in `lib/app/emails.ts`, and it cannot be** — `EmailPropsMap` is a closed interface
 * of four auth kinds, so a leaf can override an email but not add one (sunrise#468). It renders
 * directly through `sendEmail`, the workaround `quarterly-nudge.tsx` established.
 *
 * **No unsubscribe link, deliberately.** This is not a nudge and not a sequence: it is one message a
 * person wrote to another person about an audit they started, so a machine-readable opt-out would
 * misdescribe what it is. The line that replaces it is honest about the same thing — replying reaches
 * her, because it came from her.
 *
 * Colours follow the confirmed brand direction, matching `quarterly-nudge.tsx`. I2 binds the copy this
 * file authors: no em dashes, no banned lexicon, short sentences.
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

export interface CoachMessageEmailProps {
  /** First name where we have one. Only used for the preview line; the body carries her own greeting. */
  firstName: string | null;
  /** What Rashmir wrote, as she wrote it. Blank lines separate paragraphs. */
  body: string;
  /** Where the audit they left is waiting. */
  programmeUrl: string;
}

/** Her text as paragraphs. Blank lines split; single newlines stay inside a paragraph. */
function paragraphsOf(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block !== '');
}

export default function CoachMessageEmail({
  firstName,
  body,
  programmeUrl,
}: CoachMessageEmailProps): React.ReactElement {
  const paragraphs = paragraphsOf(body);

  return (
    <Html lang="en">
      <Head />
      <Preview>{firstName ? `A note for ${firstName}` : 'A note about your time audit'}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{BRAND.name}</Heading>

          {paragraphs.map((paragraph, index) => (
            <Text key={index} style={text}>
              {paragraph}
            </Text>
          ))}

          <Section style={buttonContainer}>
            <Button href={programmeUrl} style={button}>
              Open your audit
            </Button>
          </Section>

          <Hr style={hr} />

          <Text style={footer}>
            This was written and sent by a person, not by the tool. Replying reaches them.
          </Text>

          <Text style={footer}>
            {BRAND.name} is a guided time audit designed by Rashmir Balasubramaniam.
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
  whiteSpace: 'pre-line',
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
