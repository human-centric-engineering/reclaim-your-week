/**
 * The conversation as a PDF — the other half of what a leader takes away.
 *
 * The report is a reading of the audit; this is the audit. They are offered side by side and styled
 * as one set on purpose: a leader who keeps both should be able to put them next to each other and
 * see that they came from the same place.
 *
 * A server-rendered `@react-pdf/renderer` document, like `SummaryPdfDocument` — react-pdf primitives
 * and a `StyleSheet`, never Tailwind, never mounted in a browser.
 *
 * ## What it does that the report does not
 *
 * **It runs to as many pages as the conversation took.** A forty minute audit is long, so every turn
 * is `wrap={false}` only where it is short enough to be worth keeping whole; long turns are allowed
 * to break across a page rather than leaving half a page white.
 *
 * **It does not interpret.** No summary, no highlights, no "key moments". It is a record, and the
 * whole value of a record is that nobody chose what went in it.
 *
 * The two speakers are told apart by weight and a label rather than by colour, because this is a
 * document that will be printed in black on white as often as not.
 */

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

import type { OwnTranscript } from '@/lib/app/programme/runs/transcript';

// The report's ink, so the two documents sit together. Light-mode only: a PDF has no theme.
const INK = '#112c36';
const MUTED = '#566b73';
const FAINT = '#8fa3aa';
const HAIRLINE = '#dbe4e7';
const TEAL = '#0d4f68';

const styles = StyleSheet.create({
  page: {
    paddingTop: 54,
    paddingBottom: 64,
    paddingHorizontal: 54,
    fontSize: 10,
    color: INK,
    fontFamily: 'Helvetica',
    lineHeight: 1.55,
  },
  eyebrow: { fontSize: 8, color: TEAL, letterSpacing: 2, marginBottom: 10 },
  title: { fontSize: 22, lineHeight: 1.2, marginBottom: 6 },
  meta: { fontSize: 9, color: MUTED, marginBottom: 4 },
  intro: {
    fontSize: 9,
    color: MUTED,
    marginBottom: 22,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: HAIRLINE,
  },

  turn: { marginBottom: 12 },
  speaker: { fontSize: 7.5, letterSpacing: 1.6, color: MUTED, marginBottom: 3 },
  // The leader's own words sit in a band, the way they do on screen.
  leaderBody: {
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: TEAL,
  },
  empty: { fontSize: 10, color: MUTED, marginTop: 10 },

  pageNumber: { position: 'absolute', bottom: 30, right: 54, fontSize: 7.5, color: FAINT },
});

export function TranscriptPdfDocument({ transcript }: { transcript: OwnTranscript }) {
  const heading = transcript.firstName
    ? `${transcript.firstName}'s conversation`
    : 'Your conversation';
  const on = transcript.startedAt.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <Document title={heading} author="Reclaim Your Week">
      <Page size="A4" style={styles.page}>
        <Text style={styles.eyebrow}>RECLAIM YOUR WEEK</Text>
        <Text style={styles.title}>{heading}</Text>
        <Text style={styles.meta}>{on}</Text>
        <Text style={styles.intro}>
          The whole of what was said, in the order it was said. Nothing has been shortened or left
          out.
        </Text>

        {transcript.turns.length === 0 ? (
          <Text style={styles.empty}>This audit has no conversation recorded against it.</Text>
        ) : (
          transcript.turns.map((turn) => (
            <View key={turn.id} style={styles.turn}>
              <Text style={styles.speaker}>{turn.role === 'leader' ? 'YOU' : 'COACH'}</Text>
              <View style={turn.role === 'leader' ? styles.leaderBody : undefined}>
                <Text>{turn.text}</Text>
              </View>
            </View>
          ))
        )}

        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}
