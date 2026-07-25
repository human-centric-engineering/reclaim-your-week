/**
 * The per-phase signpost (F4 t-4, content-source §5d / G10). Entering a phase, name it, say what it
 * involves, and give a rough sense of how long — so the process never feels open-ended. Held in a
 * soft cream band so it has presence without a hard card. Copy is structural orientation, not
 * Rashmir's verbatim voice (that content is F6/F7).
 */

import { PHASE_SIGNPOSTS } from '@/lib/app/programme/runs/signposts';

export function Signpost({
  phaseKey,
  index,
  label,
}: {
  phaseKey: string;
  index: number;
  label: string;
}) {
  const signpost = PHASE_SIGNPOSTS[phaseKey];

  return (
    <div className="bg-muted rounded-2xl px-7 py-6">
      <p className="text-muted-foreground text-[0.7rem] font-medium tracking-[0.2em] uppercase">
        Phase {index} · {label}
      </p>
      {signpost && (
        <>
          <p className="text-foreground mt-3 text-xl leading-snug font-light text-balance">
            {signpost.involves}
          </p>
          <p className="text-muted-foreground mt-3 text-sm">
            This part usually takes {signpost.duration}. There is no rush.
          </p>
        </>
      )}
    </div>
  );
}
