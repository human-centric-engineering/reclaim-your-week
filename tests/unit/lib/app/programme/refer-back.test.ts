/**
 * The refer-back (F7 t-2, I13). `readRunAnswers` + Prisma are mocked. Load-bearing: the leader's Phase
 * 0 words come back **run-scoped** — from slot data, never invented — and the block is empty when
 * nothing was captured.
 *
 * **And the block only calls itself a quote when it is serving one.** A conversationally-captured
 * reading stores the coach's rendering in `value` and the leader's actual sentence in
 * `provenance.verbatim`. While only the first existed, this block instructed the coach to return the
 * words "verbatim, do not paraphrase" over a string that was a paraphrase by construction, so the
 * audit quoted a sentence nobody had said. The wording is now conditional on what is actually held,
 * and both halves are pinned below: a run with real quotes gets the verbatim instruction, a run
 * without gets one that asks for the substance instead.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { readAnswersMock, findFirstMock } = vi.hoisted(() => ({
  readAnswersMock: vi.fn(),
  findFirstMock: vi.fn(),
}));
vi.mock('@/lib/app/programme/runs/answers', () => ({ readRunAnswers: readAnswersMock }));
vi.mock('@/lib/db/client', () => ({
  prisma: { reclaimAuditRun: { findFirst: findFirstMock } },
}));

import { buildReferBack, buildReferBackForActiveRun } from '@/lib/app/programme/refer-back';

/** A reading with no verbatim recorded — every form-path row, and everything captured before it existed. */
const answer = (value: string) => ({ value, valueJson: null });

/** A reading the coach took a real quote for: a tidy `value`, and the sentence the leader said. */
const quoted = (value: string, verbatim: string) => ({ value, valueJson: null, verbatim });

beforeEach(() => {
  readAnswersMock.mockReset();
  findFirstMock.mockReset();
});

describe('buildReferBack', () => {
  it("serves the leader's own sentence, and instructs the coach to quote it, when one was recorded", async () => {
    readAnswersMock.mockResolvedValue({
      reclaim_setup_keeping_me_up: quoted(
        'Whether the team can run without them.',
        'Honestly? Whether the whole thing falls over if I take a week off.'
      ),
      reclaim_setup_why_now: quoted(
        'A board review is coming up.',
        "There's a board review in March and I don't want to arrive at it like this."
      ),
    });
    const referBack = await buildReferBack('u1', 'run-1');

    // The default policy leans verbatim for exactly these two slugs, because this beat exists.
    expect(referBack.keepingMeUp).toBe(
      'Honestly? Whether the whole thing falls over if I take a week off.'
    );
    expect(referBack.contextBlock).toContain(
      '"Honestly? Whether the whole thing falls over if I take a week off."'
    );
    expect(referBack.contextBlock).toContain(
      '"There\'s a board review in March and I don\'t want to arrive at it like this."'
    );
    // The coach's tidy rendering is not what gets read back at the gap.
    expect(referBack.contextBlock).not.toContain('Whether the team can run without them.');
    expect(referBack.contextBlock.toLowerCase()).toContain('verbatim'); // instructs it not to paraphrase
  });

  it('does not claim a quote it does not have, when no verbatim was recorded', async () => {
    readAnswersMock.mockResolvedValue({
      reclaim_setup_keeping_me_up: answer('Whether the team can run without me.'),
      reclaim_setup_why_now: answer('A board review is coming up.'),
    });
    const referBack = await buildReferBack('u1', 'run-1');

    // The reading still comes back and is still put in front of the leader — falling back to `value`
    // is the common case and always will be, because a form-path row's `value` IS the leader's typing.
    expect(referBack.keepingMeUp).toBe('Whether the team can run without me.');
    expect(referBack.contextBlock).toContain('"Whether the team can run without me."');
    expect(referBack.contextBlock).toContain('"A board review is coming up."');
    // But it must not tell the coach these are their exact words.
    expect(referBack.contextBlock.toLowerCase()).not.toContain('verbatim');
    expect(referBack.contextBlock).toContain('as it was recorded rather than word for');
  });

  it("does not quote either answer when only one of the two is the leader's own words", async () => {
    // Quoting one and reporting the other would read as the tool choosing which to take seriously.
    readAnswersMock.mockResolvedValue({
      reclaim_setup_keeping_me_up: quoted('The team.', 'The team, mostly. Whether they need me.'),
      reclaim_setup_why_now: answer('A board review is coming up.'),
    });
    const referBack = await buildReferBack('u1', 'run-1');

    expect(referBack.contextBlock.toLowerCase()).not.toContain('verbatim');
  });

  it('reads run-scoped — the two setup slugs for THIS run', async () => {
    readAnswersMock.mockResolvedValue({});
    await buildReferBack('u1', 'run-1');
    expect(readAnswersMock).toHaveBeenCalledWith('u1', 'run-1', [
      'reclaim_setup_keeping_me_up',
      'reclaim_setup_why_now',
    ]);
  });

  it('is empty when neither answer was captured (no fabricated block)', async () => {
    readAnswersMock.mockResolvedValue({});
    const referBack = await buildReferBack('u1', 'run-1');
    expect(referBack.keepingMeUp).toBeNull();
    expect(referBack.whyNow).toBeNull();
    expect(referBack.contextBlock).toBe('');
  });
});

describe('buildReferBackForActiveRun', () => {
  it('resolves the active run and builds its refer-back', async () => {
    findFirstMock.mockResolvedValue({ id: 'run-9' });
    readAnswersMock.mockResolvedValue({ reclaim_setup_why_now: answer('Now feels right.') });
    const referBack = await buildReferBackForActiveRun('u1');
    expect(findFirstMock).toHaveBeenCalledWith({
      where: { userId: 'u1', status: 'in_progress' },
      select: { id: true },
    });
    expect(readAnswersMock).toHaveBeenCalledWith('u1', 'run-9', expect.any(Array));
    expect(referBack.whyNow).toBe('Now feels right.');
  });

  it('is empty when the user has no active run', async () => {
    findFirstMock.mockResolvedValue(null);
    const referBack = await buildReferBackForActiveRun('u1');
    expect(referBack.contextBlock).toBe('');
    expect(readAnswersMock).not.toHaveBeenCalled();
  });
});
