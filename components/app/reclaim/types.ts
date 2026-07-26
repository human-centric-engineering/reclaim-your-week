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
  run: z
    .object({
      id: z.string(),
      quarter: z.string().nullable(),
      conversationId: z.string().nullable(),
    })
    .nullable(),
  phases: z.array(phaseViewSchema),
  currentPhaseKey: z.string(),
});

export type PhaseStatus = z.infer<typeof phaseStatusSchema>;
export type PhaseView = z.infer<typeof phaseViewSchema>;
export type CurrentRunState = z.infer<typeof currentRunStateSchema>;
