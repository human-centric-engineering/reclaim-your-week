/**
 * Access tiers (F8). Pure data + one predicate, so these are cheap — but two of them are load-bearing
 * enough to pin: the free tier is **one** complete audit (Brief §8, the thing the whole gate exists to
 * enforce), and `client` is the only window-bounded tier, which is what makes `grantIsLive` ignore its
 * audit count. A silent change to either would loosen access without touching the gate's own code.
 */

import { describe, it, expect } from 'vitest';
import {
  RECLAIM_TIERS,
  RECLAIM_INVITE_TIERS,
  AUDITS_GRANTED,
  isInviteTier,
  isWindowBounded,
} from '@/lib/app/programme/access/tiers';

describe('tier definitions', () => {
  it('grants exactly one complete audit on every count-bounded tier (Brief §8)', () => {
    expect(AUDITS_GRANTED.free).toBe(1);
    expect(AUDITS_GRANTED.standard).toBe(1);
    expect(AUDITS_GRANTED.referral).toBe(1);
  });

  it('treats only `client` as window-bounded', () => {
    expect(isWindowBounded('client')).toBe(true);
    for (const tier of RECLAIM_TIERS.filter((t) => t !== 'client')) {
      expect(isWindowBounded(tier)).toBe(false);
    }
  });

  it('does not offer `free` as something Rashmir can invite someone to', () => {
    // `free` is what an account falls back to, not a door she opens — offering it in the admin picker
    // would create grants with no invite behind them.
    expect(RECLAIM_INVITE_TIERS).not.toContain('free');
    expect(isInviteTier('free')).toBe(false);
  });

  it('recognises every invitable tier and nothing else', () => {
    for (const tier of RECLAIM_INVITE_TIERS) expect(isInviteTier(tier)).toBe(true);
    expect(isInviteTier('platinum')).toBe(false);
    expect(isInviteTier('')).toBe(false);
  });

  it('keeps every invitable tier inside the known tier set', () => {
    for (const tier of RECLAIM_INVITE_TIERS) {
      expect(RECLAIM_TIERS).toContain(tier);
      expect(AUDITS_GRANTED[tier]).toBeGreaterThan(0);
    }
  });
});
