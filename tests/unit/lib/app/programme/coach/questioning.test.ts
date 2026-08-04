/**
 * The one config key the coach's capabilities can reach (`coach/questioning.ts`). Prisma mocked.
 *
 * **Why this file exists at all.** Every other test that touches this module mocks it —
 * `offer-choices.test.ts` and `phase-context.test.ts` both replace it wholesale, because what they are
 * testing is what the *consumers* do with a pairing setting, not how it is read. That is correct for
 * them and it left the read itself with no test: the module-row query, the unedited-row default, and
 * the malformed-config fallback had never executed under test.
 *
 * Each of those three is load-bearing. `pairing` decides whether `offer_choices` refuses a reading
 * asked with a partner, and `opportunistic` decides whether the coach may follow a leader onto a later
 * reading. A read that threw, or that yielded `undefined` on a row nobody has saved yet, would take
 * the guard out on the ordinary path — an operator who has never opened the config form — and the
 * failure would look like a coach that had simply stopped honouring the rule.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { moduleFindUnique } = vi.hoisted(() => ({ moduleFindUnique: vi.fn() }));
vi.mock('@/lib/db/client', () => ({
  prisma: { module: { findUnique: moduleFindUnique } },
}));

import { readReclaimQuestioning } from '@/lib/app/programme/coach/questioning';
import { RECLAIM_MODULE_SLUG } from '@/lib/app/programme/identity';

beforeEach(() => {
  moduleFindUnique.mockReset();
});

describe('readReclaimQuestioning — the shipped defaults', () => {
  it('pairs readings and follows the leader when no operator has ever saved the config', async () => {
    // The ordinary state of a fresh deployment, and the one the whole product is described against:
    // the source asks the areas as a pair, and the capture list is what lets the coach be led.
    moduleFindUnique.mockResolvedValue(null);

    expect(await readReclaimQuestioning()).toEqual({ pairing: 'paired', opportunistic: true });
  });

  it('does the same for a module row saved with nothing in it', async () => {
    // Distinct from the row being absent: an operator who has opened the config form and saved some
    // other key leaves `questioning` unwritten, and the row exists with the key missing.
    moduleFindUnique.mockResolvedValue({ config: {} });

    expect(await readReclaimQuestioning()).toEqual({ pairing: 'paired', opportunistic: true });
  });

  it('reads the module row by slug, and only the config column', async () => {
    // Narrow by design — this module exists to stay clear of `module.ts`, and a read that pulled the
    // whole row would invite it back.
    moduleFindUnique.mockResolvedValue({ config: {} });

    await readReclaimQuestioning();

    expect(moduleFindUnique).toHaveBeenCalledWith({
      where: { slug: RECLAIM_MODULE_SLUG },
      select: { config: true },
    });
  });
});

describe('readReclaimQuestioning — what an operator has saved', () => {
  it('honours a stored `one-at-a-time`, which is the escape hatch the pairing rule reads', async () => {
    // The setting `offer_choices` turns on: asked singly, a reading's answer set is real, and the
    // guard that suppresses it under `paired` must stand down.
    moduleFindUnique.mockResolvedValue({ config: { questioning: { pairing: 'one-at-a-time' } } });

    expect(await readReclaimQuestioning()).toEqual({
      pairing: 'one-at-a-time',
      opportunistic: true,
    });
  });

  it('honours a stored `opportunistic: false`, restoring a fixed running order', async () => {
    moduleFindUnique.mockResolvedValue({ config: { questioning: { opportunistic: false } } });

    expect(await readReclaimQuestioning()).toEqual({ pairing: 'paired', opportunistic: false });
  });

  it('keeps the other keys of a config it shares with the rest of the module', async () => {
    // It parses the one key it needs out of a column every other reader also uses, so a config full of
    // settings it knows nothing about must not disturb it.
    moduleFindUnique.mockResolvedValue({
      config: { strategyMirrorMode: 'off', openSignup: true, questioning: { pairing: 'paired' } },
    });

    expect(await readReclaimQuestioning()).toEqual({ pairing: 'paired', opportunistic: true });
  });
});

describe('readReclaimQuestioning — a config it cannot trust', () => {
  it('falls to the defaults on a value outside the enum, rather than passing it on', async () => {
    // The failure that matters is not the bad value itself; it is a `pairing` of `undefined` reaching
    // the guard, which reads as "not paired" and quietly turns the rule off on every turn.
    moduleFindUnique.mockResolvedValue({ config: { questioning: { pairing: 'sometimes' } } });

    expect(await readReclaimQuestioning()).toEqual({ pairing: 'paired', opportunistic: true });
  });

  it('falls to the defaults when the key is the wrong shape entirely', async () => {
    moduleFindUnique.mockResolvedValue({ config: { questioning: 'paired' } });

    expect(await readReclaimQuestioning()).toEqual({ pairing: 'paired', opportunistic: true });
  });

  it('falls to the defaults when the whole config column is not an object', async () => {
    // `config` is JSON, so a hand-edited row can hold a string or a list and Prisma will return it.
    moduleFindUnique.mockResolvedValue({ config: 'paired' });

    expect(await readReclaimQuestioning()).toEqual({ pairing: 'paired', opportunistic: true });
  });

  it('falls to the defaults on a null config, which is the column’s own empty state', async () => {
    moduleFindUnique.mockResolvedValue({ config: null });

    expect(await readReclaimQuestioning()).toEqual({ pairing: 'paired', opportunistic: true });
  });
});
