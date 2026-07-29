/**
 * Client-side shapes for the programme shell (F4 t-4), with Zod schemas so the shell validates the
 * `GET /runs/current` response instead of casting `unknown` (mirrors the service's server types).
 */

import { z } from 'zod';

export const phaseStatusSchema = z.enum(['completed', 'active', 'upcoming']);
export const phaseViewSchema = z.object({
  key: z.string(),
  label: z.string(),
  status: phaseStatusSchema,
});
export const currentRunStateSchema = z.object({
  // `conversationId` is the run's own transcript (null until the leader first speaks to the coach) —
  // what lets a reload resume the conversation rather than starting the phase again in silence.
  //
  // `coachOpenings` is the moments this run has already had. It is what stops a reload replaying a
  // beat: showing a leader the picture of their week for the "first" time twice would be worse than
  // not showing it at all.
  run: z
    .object({
      id: z.string(),
      quarter: z.string().nullable(),
      conversationId: z.string().nullable(),
      coachOpenings: z.array(z.string()).default([]),
      // Where each phase's part of the run's one conversation begins. Defaulted so a response from
      // before this shipped still parses — every phase then reads from the top, as it used to.
      phaseMarks: z.record(z.string(), z.string()).default({}),
    })
    .nullable(),
  phases: z.array(phaseViewSchema),
  currentPhaseKey: z.string(),
});

/** The coach-editable UI config the shell reads (`GET /api/v1/app/reclaim/config`). */
export const uiConfigSchema = z.object({
  strategyMirror: z.boolean(),
  phaseSignposts: z
    .array(
      z.object({
        phaseKey: z.string(),
        involves: z.string(),
        duration: z.string(),
        opening: z.array(z.string()),
      })
    )
    .default([]),
  // How much of a phase has to be covered before the move onward is offered. Defaulted so a response
  // from before this shipped still parses, at the same number that used to be compiled in.
  phaseCoveredPercent: z.number().default(90),
});

export type PhaseStatus = z.infer<typeof phaseStatusSchema>;
export type PhaseView = z.infer<typeof phaseViewSchema>;
export type CurrentRunState = z.infer<typeof currentRunStateSchema>;
