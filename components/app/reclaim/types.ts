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
  run: z.object({ id: z.string(), quarter: z.string().nullable() }).nullable(),
  phases: z.array(phaseViewSchema),
  currentPhaseKey: z.string(),
});

export type PhaseStatus = z.infer<typeof phaseStatusSchema>;
export type PhaseView = z.infer<typeof phaseViewSchema>;
export type CurrentRunState = z.infer<typeof currentRunStateSchema>;
