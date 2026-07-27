-- Which coach-opening moments a run has already fired.
--
-- Appended once and never removed: a moment is something that happened to a leader, so re-firing it
-- would replay a beat they have already had. The stream route claims a moment with a conditional
-- UPDATE before generating, which is what makes two tabs, a StrictMode double effect and a reload
-- mid-stream collapse to a single turn.
--
-- Additive with a default, so existing runs are correct without a backfill: a run mid-audit has
-- fired no moments, which is exactly what an empty array says.
ALTER TABLE "app_reclaim_audit_run"
  ADD COLUMN "coachOpenings" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
