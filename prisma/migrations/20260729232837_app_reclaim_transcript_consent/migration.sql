-- F17: whether the leader chose to let Rashmir read the conversation, not only the results.
--
-- NOT NULL DEFAULT false, never nullable. Absent consent must read as "not given", and a nullable
-- column invites a `?? true` downstream. Every existing row correctly becomes "shared their results,
-- did not share the conversation" — which is exactly what those leaders chose, because the
-- conversation was never on offer.
--
-- A column on the existing CASCADE row rather than a new table: a new leaf model would join the
-- schema, hand-written FK SQL, the drift probes, EXPORTED_SOURCES and the erasure smoke, and this
-- needs none of that.
--
-- Hand-authored for the same reason as the two before it (see the F14 migration's note).
ALTER TABLE "app_reclaim_report_share"
  ADD COLUMN "transcriptConsent" BOOLEAN NOT NULL DEFAULT false;
