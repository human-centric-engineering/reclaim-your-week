'use client';

/**
 * The shared "save this phase and continue" control (F7). Batch-saves the phase's answers (I3) then
 * advances (I9 — the server owns the reflection gate; this surfaces its 422 distinctly). Used by
 * Phases 2–5, which otherwise differ only in their fields.
 */

import { useState } from 'react';
import { saveBatch, advancePhase, type AnswerInput } from '@/components/app/reclaim/phase/actions';

export function AdvanceControls({
  runId,
  fromPhase,
  answers,
  canAdvance,
  onAdvanced,
  label = 'Continue to the next section',
}: {
  runId: string;
  fromPhase: string;
  /** Built at submit time so the latest field state is captured. */
  answers: () => AnswerInput[];
  canAdvance: boolean;
  onAdvanced: () => void;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveBatch(runId, answers());
      const advanced = await advancePhase(runId, fromPhase);
      if (!advanced.ok) {
        throw new Error(
          advanced.reflectionRequired
            ? 'A reflection is needed before moving on.'
            : (advanced.message ?? 'We could not move on just now.')
        );
      }
      onAdvanced();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-muted-foreground text-sm" role="status">
          {error} You can try again.
        </p>
      )}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || !canAdvance}
        className="bg-primary text-primary-foreground rounded-full px-8 py-3 text-[0.95rem] font-medium disabled:opacity-40"
      >
        {busy ? 'Saving…' : label}
      </button>
    </div>
  );
}
