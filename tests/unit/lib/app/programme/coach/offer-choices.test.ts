/**
 * The tool that lets the screen draw answers instead of a blank box.
 *
 * What is under test is not "does it return four strings". It is the division of labour the
 * capability exists to enforce: **the model names the reading, the product owns the answers.** So the
 * assertions are mostly about what a model *cannot* make it do — offer a set for another section,
 * for a reading that has none, or for a reading that does not exist — because those are the three
 * ways a leader ends up tapping a button that produces something their audit cannot store.
 *
 * The fourth way is the one that cost a leader a bad screen: a reading whose set is real but whose
 * *question* is not, because it is being asked in one breath with a reading answered in the leader's
 * own words. So the run is mocked rather than the guard — what these assert is the real pairing
 * arithmetic in `compoundQuestionSlugs`, reached the way the capability reaches it.
 *
 * The other property, asserted last, is that it writes nothing. `record_answers` is the coach's only
 * write (I6), and a tool that drew a button and also filled a slot would be the audit recording an
 * answer nobody gave.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReclaimOfferChoicesCapability } from '@/lib/app/programme/coach/capabilities/offer-choices';
import { RECLAIM_RUN_SCOPE_KEY } from '@/lib/app/programme/coach/scope';
import { RECLAIM_MODULE_SLUG } from '@/lib/app/programme/identity';

const { readRunAnswers, readQuestioning } = vi.hoisted(() => ({
  readRunAnswers: vi.fn(),
  readQuestioning: vi.fn(),
}));

vi.mock('@/lib/app/programme/runs/answers', () => ({ readRunAnswers }));
vi.mock('@/lib/app/programme/coach/questioning', () => ({
  readReclaimQuestioning: readQuestioning,
}));

const capability = new ReclaimOfferChoicesCapability();

/** A reading this run holds, in the shape the pairing arithmetic reads. */
const recorded = (value: string, valueJson: unknown) => ({
  value,
  valueJson,
  sourceType: 'direct',
  confidence: 10,
});

beforeEach(() => {
  vi.clearAllMocks();
  readRunAnswers.mockResolvedValue({});
  readQuestioning.mockResolvedValue({ pairing: 'paired', opportunistic: true });
});

/** The dispatch scope the run's own stream route builds. The phase is never a model argument. */
const contextIn = (phaseKey: string) => ({
  userId: 'user_leader_1',
  agentId: 'agent_coach',
  conversationId: 'conv_1',
  scope: {
    moduleSlug: RECLAIM_MODULE_SLUG,
    nodeKey: phaseKey,
    [RECLAIM_RUN_SCOPE_KEY]: 'run_q3_2026',
  },
});

describe('offer_choices', () => {
  it('answers with the authored set and a leader-facing label, never a slug', async () => {
    const result = await capability.execute(
      { slotSlug: 'reclaim_setup_audit_period' },
      contextIn('phase-0-setup')
    );

    expect(result.success).toBe(true);
    expect(result.data?.options).toEqual(['last week', 'last month', 'last quarter', 'last year']);
    // The label reaches a screen reader, so it must be the words the panel uses. A slug leaking here
    // would break I1/I2 in the one place nobody looks.
    expect(result.data?.label).toBe('The period being audited');
    expect(result.data?.slotSlug).toBe('reclaim_setup_audit_period');
  });

  it('derives yes and no for a boolean reading, so no list has to be kept in step', async () => {
    // Held already, so the coach is going back to confirm it rather than asking it with its partner.
    // A lone yes-or-no keeps its buttons — see the compound-question tests below for the other case.
    readRunAnswers.mockResolvedValue({
      reclaim_setup_in_transition: recorded('Yes', true),
    });

    const result = await capability.execute(
      { slotSlug: 'reclaim_setup_in_transition' },
      contextIn('phase-0-setup')
    );

    expect(result.data?.options).toEqual(['Yes', 'No']);
  });

  it('refuses the anchor of a live pair, because the question on screen is both halves', async () => {
    // The bug, exactly as a leader met it. The coach asked "with a team split between two locations,
    // how does having a distributed team shape your leadership?" and the screen put **Yes / No**
    // under it. Nothing the other three guards check was wrong — the reading exists, it is a boolean,
    // it is in section 0 — but it is the anchor of a pair whose second half is answered in the
    // leader's own words, so the buttons answered a question nobody had asked.
    const result = await capability.execute(
      { slotSlug: 'reclaim_profile_distributed_team' },
      contextIn('phase-0-setup')
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('inside_compound_question');
    // Fed back into the same turn, so it must leave the coach able to finish asking rather than
    // simply told no: it is the offer that is wrong here, never the question.
    expect(result.error?.message).toContain('one open question');
  });

  it('refuses the follower half too, where that is the half carrying the set', async () => {
    // The fundraising pair is the case where the *second* reading has the authored options ("I have a
    // development team" / "I carry it myself"). Same failure, different buttons — so the rule is
    // about the question, not about which end of the pair happens to be closed.
    const result = await capability.execute(
      { slotSlug: 'reclaim_setup_fundraising_support' },
      contextIn('phase-0-setup')
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('inside_compound_question');
  });

  it('allows the follower once its anchor has landed and the question stands alone', async () => {
    // A pair is a compound question only while both halves are outstanding. Refusing after the anchor
    // is in would cost the leader an offer for a question that really is a choice.
    readRunAnswers.mockResolvedValue({
      reclaim_setup_fundraising_relevant: recorded('Yes', true),
    });

    const result = await capability.execute(
      { slotSlug: 'reclaim_setup_fundraising_support' },
      contextIn('phase-0-setup')
    );

    expect(result.success).toBe(true);
    expect(result.data?.options).toEqual(['I have a development team', 'I carry it myself']);
  });

  it('allows an anchor when the deployment asks every reading on its own', async () => {
    // Under `one-at-a-time` there is no compound question to be half of, and the coach is told to ask
    // the anchor alone. A guard that assumed pairing would fight that instruction.
    readQuestioning.mockResolvedValue({ pairing: 'one-at-a-time', opportunistic: true });

    const result = await capability.execute(
      { slotSlug: 'reclaim_profile_distributed_team' },
      contextIn('phase-0-setup')
    );

    expect(result.success).toBe(true);
    expect(result.data?.options).toEqual(['Yes', 'No']);
  });

  it('offers rather than refuses when the run cannot be read at all', async () => {
    // Fails open, deliberately. A wrong offer names the reading it is for and sits beside a way to
    // type instead; an offer silently withheld for every leader during a database wobble is neither
    // visible nor recoverable, and it is worse than the blank box this mechanism replaced.
    readRunAnswers.mockRejectedValue(new Error('the run could not be read'));

    const result = await capability.execute(
      { slotSlug: 'reclaim_setup_audit_period' },
      contextIn('phase-0-setup')
    );

    expect(result.success).toBe(true);
  });

  it('refuses a reading from another section, because the section is not the model’s to choose', async () => {
    // The guard that makes this safe to grant: the phase comes from the server-issued dispatch scope
    // (I6), so a coach in section 2 cannot put section 0's answers under the leader's question.
    const result = await capability.execute(
      { slotSlug: 'reclaim_setup_audit_period' },
      contextIn('phase-2-energy')
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('wrong_phase');
  });

  it('refuses a reading the leader answers in their own words, and says to ask it openly', async () => {
    const result = await capability.execute(
      { slotSlug: 'reclaim_setup_keeping_me_up' },
      contextIn('phase-0-setup')
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('no_choices');
    // The message is fed back into the same turn, so it has to leave the coach able to finish the
    // question it was part-way through asking rather than just telling it no.
    expect(result.error?.message).toContain('open question');
  });

  it('refuses a slug that is not a reading in this audit', async () => {
    const result = await capability.execute(
      { slotSlug: 'reclaim_setup_favourite_colour' },
      contextIn('phase-0-setup')
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('unknown_slot');
  });

  it('refuses when no section is in scope rather than falling back to any section', async () => {
    // Unreachable through the run's own stream route, which always supplies both keys. Asserted
    // because the failure mode of the other reading is an unchecked offer, and a guard that only
    // holds while its caller is well-behaved is not a guard.
    const result = await capability.execute(
      { slotSlug: 'reclaim_setup_audit_period' },
      { ...contextIn('phase-0-setup'), scope: { [RECLAIM_RUN_SCOPE_KEY]: 'run_q3_2026' } }
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('no_phase_scope');
  });

  it('keeps the trace literal, because nothing it holds is the leader’s', async () => {
    // The deliberate non-redaction. Every other capability's provenance is scrubbed because its
    // arguments carry what the leader said; this one's arguments are a vetted slug and its result is
    // option text the form panel has drawn in public since v1. Redacting it would leave the audit
    // trail unable to say what was actually put in front of the leader.
    const args = { slotSlug: 'reclaim_setup_audit_period' };
    const result = await capability.execute(args, contextIn('phase-0-setup'));

    const provenance = capability.redactProvenance(args, result);

    expect(provenance.args).toEqual(args);
    expect(provenance.resultPreview).toContain('last quarter');
    expect(provenance.resultPreview).not.toContain('[redacted]');
  });

  it('writes nothing at all — record_answers stays the coach’s only write (I6)', async () => {
    // The whole audit passes through `saveAnswerWithRetry`. If this capability ever grew a write, it
    // would grow it here, and a leader would have a reading recorded because a button was drawn
    // rather than because they answered.
    const write = await import('@/lib/app/programme/slots/write');
    const spy = vi.spyOn(write, 'saveAnswerWithRetry');

    await capability.execute(
      { slotSlug: 'reclaim_setup_audit_period' },
      contextIn('phase-0-setup')
    );

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
