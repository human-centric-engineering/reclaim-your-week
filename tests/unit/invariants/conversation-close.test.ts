/**
 * I15 — a run that ends closes its conversation, however it ended (F16 t-1).
 *
 * > **I15:** `isActive: false` on completion, so a repeat audit opens a fresh transcript rather than
 * > resuming the last one.
 *
 * **Why this guard did not exist until now, and why it does.** For ten features there was exactly one
 * way an audit ended, and `completeRun` did the right thing. I15 was proved end to end by
 * `smoke:reclaim-run` and by nothing else, which was proportionate.
 *
 * F16 added a second ending. An abandoned run that leaves its transcript active re-opens I15 by a
 * door the invariant's own wording does not mention — it says "on completion" — and the failure is
 * invisible at the moment it happens: the next audit simply opens with the coach having read the
 * abandoned one's phase 4, which reads as the coach being oddly well informed rather than as a bug.
 *
 * So the assertion is deliberately about **both** paths, and about the shape rather than the
 * behaviour: a static read of the service, which is what catches a third ending being added later
 * without one. A behavioural test would need a real database, which is `smoke:reclaim-run`'s job and
 * runs in a different gate.
 *
 * Wired into `leaf:checks` via the `tests/unit/invariants` directory glob.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SERVICE = 'app/api/v1/app/reclaim/runs/service.ts';
const source = readFileSync(SERVICE, 'utf8');

/** The body of a named exported function, up to the next top-level `export`. */
function bodyOf(name: string): string {
  const start = source.indexOf(`export async function ${name}(`);
  expect(start, `${name} is no longer an exported function in ${SERVICE}`).toBeGreaterThan(-1);
  const rest = source.slice(start + 1);
  const end = rest.indexOf('\nexport ');
  return end === -1 ? rest : rest.slice(0, end);
}

describe('I15 — every ending closes the conversation', () => {
  it.each(['completeRun', 'abandonRun'])('%s deactivates the surface conversation', (fn) => {
    expect(
      bodyOf(fn),
      `${fn} does not close the surface conversation, so the next audit would resume this one's transcript (I15)`
    ).toContain('closeSurfaceConversation');
  });

  it('has exactly one implementation of the close, so the two cannot drift', () => {
    // Both call sites plus the definition. A second `updateMany` on `aiConversation` would mean one
    // of the endings had grown its own copy, which is how the two stop agreeing about what "closed"
    // means (a different `where`, a missed `contextType`).
    const definitions = source.match(/prisma\.aiConversation\.updateMany/g) ?? [];
    expect(definitions).toHaveLength(1);
  });

  it('sets isActive false rather than deleting the conversation', () => {
    // The transcript is the leader's record of their own audit and stays readable from their
    // history. Closing it is about which conversation the *next* run resumes, not about removal.
    const close = source.slice(source.indexOf('async function closeSurfaceConversation'));
    expect(close.slice(0, 600)).toContain('isActive: false');
    expect(source).not.toContain('aiConversation.delete');
  });
});

describe('I14 — letting an audit go neither consumes nor refunds an entitlement', () => {
  it('abandonRun never touches the grant', () => {
    // `consumeAudit` fires in `completeRun`, so an abandoned run has consumed nothing and there is
    // nothing to give back. A leader must not be able to buy audits by starting and dropping them,
    // and must not be charged for one they let go.
    const body = bodyOf('abandonRun');
    for (const forbidden of ['consumeAudit', 'grantAnotherAudit', 'reclaimGrant']) {
      expect(body, `abandonRun touches ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('records the abandonment in its own column, never completedAt', () => {
    // Three readers treat `completedAt` as "this audit finished": listRuns, the nudge tick's
    // `completedAt ?? startedAt`, and the quarterly completion timeline. Writing an abandonment
    // there would put this run in the nudge cohort and in the trend that measures the programme.
    const body = bodyOf('abandonRun');
    expect(body).toContain('abandonedAt');
    expect(body).not.toContain('completedAt: new Date()');
  });
});
