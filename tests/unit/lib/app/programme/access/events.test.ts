/**
 * The follow-up-sequence seam (F8 t-4).
 *
 * Small, but the guarantee is the point: this runs on the completion path, so it must **never throw**.
 * A telemetry concern that can fail a leader's finished audit is worse than no telemetry at all.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { infoMock } = vi.hoisted(() => ({ infoMock: vi.fn() }));
vi.mock('@/lib/logging', () => ({ logger: { info: infoMock } }));

import { emitReclaimAccessEvent } from '@/lib/app/programme/access/events';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('emitReclaimAccessEvent', () => {
  it('records the event name alongside its payload, so a funnel can be read from the logs', () => {
    emitReclaimAccessEvent('reclaim.access_granted', { userId: 'u1', tier: 'client' });

    expect(infoMock).toHaveBeenCalledWith(
      'Reclaim lifecycle: reclaim.access_granted',
      expect.objectContaining({ event: 'reclaim.access_granted', userId: 'u1', tier: 'client' })
    );
  });

  it('never throws, even when the logger itself fails', () => {
    infoMock.mockImplementation(() => {
      throw new Error('transport down');
    });

    expect(() => emitReclaimAccessEvent('reclaim.audit_completed', { userId: 'u1' })).not.toThrow();
  });
});
