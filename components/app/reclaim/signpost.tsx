/**
 * The per-phase signpost — the card that opens a phase (F4 t-4, extended for the conversational
 * surface). Names the phase, says what it involves, gives a rough sense of how long, and then opens
 * the phase itself.
 *
 * **This is the tool speaking first.** The source requires it of every phase: "At the start of each
 * new phase, briefly orient the client: tell them what phase they are entering, what it involves, and
 * approximately how long it will take" (`sources/Time_Audit_Tool_Prompt_Text.md:31`). Before this the
 * conversational surface opened on an empty transcript and a placeholder inviting the leader to say
 * hello, which inverts a method whose whole premise is asking before telling.
 *
 * The copy comes from `Module.config` so Rashmir can change how a phase greets someone without a
 * deploy (I11), with the shipped defaults as the fallback: a leader should never meet a phase with no
 * orientation at all because a config row could not be read.
 *
 * Rendered on **both** paths, the conversation and the form, because a phase opens the same way
 * whichever surface the leader chose.
 */

import { signpostFor, type PhaseSignpost } from '@/lib/app/programme/runs/signposts';

export function Signpost({
  phaseKey,
  index,
  label,
  signposts,
}: {
  phaseKey: string;
  index: number;
  label: string;
  /** The stored config's cards. Omitted falls back to the shipped defaults. */
  signposts?: PhaseSignpost[];
}) {
  const signpost = signpostFor(phaseKey, signposts);

  return (
    <div className="bg-muted rounded-2xl px-7 py-6">
      <p className="text-muted-foreground text-[0.7rem] font-medium tracking-[0.2em] uppercase">
        Section {index} · {label}
      </p>
      {signpost && (
        <>
          <p className="text-foreground mt-3 text-xl leading-snug font-light text-balance">
            {signpost.involves}
          </p>
          <p className="text-muted-foreground mt-3 text-sm">
            This part usually takes {signpost.duration}. There is no rush.
          </p>
          {signpost.opening.length > 0 && (
            <div className="border-border/50 mt-5 space-y-3 border-t pt-5">
              {signpost.opening.map((paragraph, i) => (
                <p key={i} className="text-foreground text-[1.02rem] leading-relaxed text-balance">
                  {paragraph}
                </p>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
