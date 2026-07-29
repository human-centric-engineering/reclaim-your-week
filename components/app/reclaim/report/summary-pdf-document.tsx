/**
 * The summary as a PDF (F15 t-1). The artifact a leader keeps.
 *
 * A server-rendered `@react-pdf/renderer` document. **Not a DOM component**: it is passed to
 * `renderToBuffer` in the route's render helper and never mounted in a browser, so it uses react-pdf
 * primitives (`Document`, `Page`, `View`, `Text`) and its own `StyleSheet`, not Tailwind.
 *
 * ## Why a second rendering of the same summary
 *
 * `SummaryView` is the screen and this is the page, and keeping them as two documents is a real cost:
 * they can drift. The alternative was headless Chrome rendering the actual page, which gives exactly
 * one source of truth and costs a ~300MB browser binary, a slow cold start and a serverless problem.
 *
 * **What makes the trade safe is that both are driven from the same `buildSummary` output.** Neither
 * reads a slot. So the two can differ in layout, which is intended, and cannot differ in content,
 * which is what would matter: a leader comparing the page to the screen must never find a
 * different figure.
 *
 * ## What it deliberately does not do
 *
 * **No interpretation of its own** (I12). It draws the figures and, where the analyst produced one,
 * the two sections `AuditSummary` already carries. There is no highlighted worst bar, no "your
 * biggest problem is", no summary sentence the screen does not also show. A PDF is the most
 * tempting place in the product to add a conclusion, and it is exactly as forbidden here.
 *
 * **Hours, never a percentage axis** (I8). The bar length is hours against the largest figure in the
 * week; the percentage rides alongside as a derived note, exactly as `ReclaimChart` does it.
 */

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

import { bucketColour } from '@/components/app/reclaim/chart/palette';
// The shared "no value here" mark. An en dash, and shared precisely so I2's em-dash ban can stay
// zero-tolerance with no allowlist. See `format.ts`.
import { NO_VALUE } from '@/components/app/reclaim/format';
import type { AuditSummary } from '@/lib/app/programme/summary';

/**
 * Light-mode colours only.
 *
 * A PDF has no theme to follow: it is printed, mailed and read on whatever the reader has. The dark
 * steps in `palette.ts` exist for a dark *surface*, and a document has none.
 */
const INK = '#112c36';
const MUTED = '#566b73';
const FAINT = '#8fa3aa';
const HAIRLINE = '#dbe4e7';
const TEAL = '#0d4f68';
const TRACK = '#eef3f5';

const styles = StyleSheet.create({
  page: {
    paddingTop: 54,
    paddingBottom: 64,
    paddingHorizontal: 54,
    fontSize: 10,
    color: INK,
    fontFamily: 'Helvetica',
    lineHeight: 1.5,
  },
  eyebrow: { fontSize: 8, color: TEAL, letterSpacing: 2, marginBottom: 10 },
  // An explicit line height for the title: the page's 1.5 leaves the tall glyphs' box too short and
  // the meta line rides up into the descenders.
  title: { fontSize: 24, fontFamily: 'Helvetica', lineHeight: 1.2, marginBottom: 6 },
  meta: { fontSize: 9, color: MUTED, marginBottom: 24 },

  sectionLabel: {
    fontSize: 8,
    color: MUTED,
    letterSpacing: 1.6,
    marginTop: 20,
    marginBottom: 6,
  },
  sectionTitle: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginTop: 20, marginBottom: 8 },
  para: { marginBottom: 6 },

  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  barLabel: { width: 132, fontSize: 8.5, color: INK, paddingRight: 6 },
  barTrack: { flex: 1, height: 9, backgroundColor: TRACK, borderRadius: 2 },
  barValue: { width: 74, fontSize: 8, color: MUTED, textAlign: 'right' },
  totalLine: { fontSize: 9, color: MUTED, marginTop: 6 },

  tableHead: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: HAIRLINE,
    paddingBottom: 4,
    marginBottom: 4,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: HAIRLINE,
    paddingVertical: 3,
  },
  cellArea: { flex: 1, fontSize: 9 },
  cellNum: { width: 60, fontSize: 9, textAlign: 'right', color: MUTED },
  cellHead: { fontSize: 7.5, color: MUTED, letterSpacing: 1 },

  gap: { marginBottom: 5, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: HAIRLINE },
  step: { marginBottom: 10, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: TEAL },
  horizon: { fontSize: 7.5, color: MUTED, letterSpacing: 1.6, marginBottom: 2 },
  stepDifference: { fontSize: 9, color: MUTED, marginTop: 1 },

  action: { backgroundColor: '#f6f5ec', borderRadius: 6, padding: 14, marginTop: 18 },
  actionText: { fontSize: 12, marginTop: 4 },
  actionMeta: { fontSize: 9, color: MUTED, marginTop: 3 },

  footnote: {
    fontSize: 7.5,
    color: FAINT,
    marginTop: 26,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: HAIRLINE,
    lineHeight: 1.45,
  },
  // Fixed, so a multi-page report is still identifiable on the page that is lying on a desk.
  pageNumber: { position: 'absolute', bottom: 30, right: 54, fontSize: 7.5, color: FAINT },
});

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * The chart, redrawn rather than screenshotted.
 *
 * `ReclaimChart` is hand-rolled `div`s rather than a charting library, which is what makes this a
 * faithful copy rather than an approximation: a track, a fill, a direct label and the figure.
 *
 * **The bar is scaled to the largest figure in the week, not to the total**, matching the screen. A
 * bar scaled to the total would make every area look small in a busy week, which is a visual claim
 * about the week that nobody made.
 */
function Bars({ summary }: { summary: AuditSummary }) {
  const max = Math.max(1, ...summary.current.buckets.map((b) => b.hours));
  return (
    <View>
      {summary.current.buckets.map((bucket) => (
        <View key={bucket.token} style={styles.barRow} wrap={false}>
          <Text style={styles.barLabel}>{bucket.title}</Text>
          <View style={styles.barTrack}>
            <View
              style={{
                width: `${Math.min(100, (bucket.hours / max) * 100)}%`,
                height: 9,
                backgroundColor: bucketColour(bucket.token, 'light'),
                borderRadius: 2,
              }}
            />
          </View>
          {/* I8: hours are the figure. The share is a derived note beside it, never the axis. */}
          <Text style={styles.barValue}>
            {round1(bucket.hours)}h · {Math.round(bucket.percent)}%
          </Text>
        </View>
      ))}
    </View>
  );
}

export function SummaryPdfDocument({ summary }: { summary: AuditSummary }) {
  const heading = summary.firstName ? `${summary.firstName}'s time audit` : 'Your time audit';
  const meta = [summary.role, summary.orgType].filter(Boolean).join(' · ');
  const period = summary.period ? `audited over the ${summary.period}` : null;
  const hasIdeal = summary.rows.some((r) => r.ideal !== null);

  return (
    <Document title={heading} author="Reclaim Your Week">
      <Page size="A4" style={styles.page}>
        <Text style={styles.eyebrow}>RECLAIM YOUR WEEK</Text>
        <Text style={styles.title}>{heading}</Text>
        {(meta || period) && (
          <Text style={styles.meta}>{[meta, period].filter(Boolean).join(' · ')}</Text>
        )}

        {summary.priorities && (
          <View>
            <Text style={styles.sectionLabel}>PRIORITIES THIS YEAR</Text>
            <Text style={styles.para}>{summary.priorities}</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>Where the week went</Text>
        <Bars summary={summary} />
        <Text style={styles.totalLine}>
          {round1(summary.current.totalHours)} hours in the week
          {summary.current.source === 'composite'
            ? ', reconciled against your calendar and the work that never reaches one'
            : ', as you described it'}
        </Text>

        {hasIdeal && (
          <View>
            <Text style={styles.sectionTitle}>Now, and the week you wanted</Text>
            <View style={styles.tableHead}>
              <Text style={[styles.cellArea, styles.cellHead]}>AREA</Text>
              <Text style={[styles.cellNum, styles.cellHead]}>NOW</Text>
              <Text style={[styles.cellNum, styles.cellHead]}>WANTED</Text>
            </View>
            {summary.rows.map((row) => (
              <View key={row.token} style={styles.tableRow} wrap={false}>
                <Text style={styles.cellArea}>{row.title}</Text>
                <Text style={styles.cellNum}>{round1(row.current)}h</Text>
                <Text style={styles.cellNum}>
                  {row.ideal === null ? NO_VALUE : `${round1(row.ideal)}h`}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* F14's two sections, in the same order the screen puts them: the gaps read the figures
            above, and the pathway comes after what the leader chose. Absent when the analyst
            produced nothing, with no placeholder, because the artifact was complete without them. */}
        {summary.analyst != null && summary.analyst.gaps.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>What stands out</Text>
            {summary.analyst.gaps.map((gapEntry) => (
              <View key={gapEntry.token} style={styles.gap} wrap={false}>
                <Text>{gapEntry.observation}</Text>
              </View>
            ))}
          </View>
        )}

        {summary.action.chosen && (
          <View style={styles.action} wrap={false}>
            <Text style={styles.sectionLabel}>WHAT YOU WILL START</Text>
            <Text style={styles.actionText}>{summary.action.chosen}</Text>
            {summary.action.when && (
              <Text style={styles.actionMeta}>Starting: {summary.action.when}</Text>
            )}
            {summary.action.howKnown && (
              <Text style={styles.actionMeta}>
                You will know it worked when: {summary.action.howKnown}
              </Text>
            )}
          </View>
        )}

        {summary.analyst != null && summary.analyst.pathway.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>One way this could go</Text>
            <Text style={[styles.para, { color: MUTED, fontSize: 9 }]}>
              Not a plan, and nothing here is owed. It is what a sequence could look like from where
              you are.
            </Text>
            {summary.analyst.pathway.map((step) => (
              <View key={step.horizon} style={styles.step} wrap={false}>
                <Text style={styles.horizon}>{step.horizon.toUpperCase()}</Text>
                <Text>{step.step}</Text>
                <Text style={styles.stepDifference}>{step.difference}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.footnote}>{summary.footnote}</Text>

        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `${pageNumber} of ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}
