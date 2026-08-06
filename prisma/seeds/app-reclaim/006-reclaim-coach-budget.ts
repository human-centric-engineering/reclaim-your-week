/**
 * Bring an installed coach row onto the authored token budget — what it may write, and how much
 * transcript it is sent.
 *
 * **Why this unit has to exist.** `002-reclaim-surface` writes both fields in the `create` half of
 * its upsert only, so that an operator's tuning survives a re-seed. That is the right default for
 * fields an admin may reasonably want to own — and it means every database seeded before they were
 * authored keeps the platform defaults, which are the exact values this change exists to move.
 * Without a forward unit the fix would apply to fresh installs and to nobody currently running the
 * product.
 *
 * **What it is fixing.** Both defaults are sized for an agent this coach is not. A reply
 * reservation is charged against the provider's per-minute token budget whether or not the model
 * uses it, and 50 messages of transcript are carried on the assumption that the transcript is the
 * agent's only memory. This coach's memory is the run briefing, rebuilt from slot values every
 * turn. Measured on a live audit against a key rated 30,000 tokens/minute: the longest reply ever
 * produced was 303 tokens against a 4096 reservation, and the last 50 messages cost ~2,370 tokens
 * where the last 16 cost ~700. See `RECLAIM_COACH_MAX_TOKENS` and
 * `RECLAIM_COACH_MAX_HISTORY_MESSAGES` for the reasoning behind each number.
 *
 * **Each field moves only while it still holds its platform default, and they are checked
 * separately.** A single `where` covering both would make the pair atomic, so an operator who had
 * tuned one would silently keep the stale value of the other. Two guarded updates also make the
 * unit safe to re-run as the authored values change: `hashInputs` folds in `agent.ts`, so editing
 * either constant re-runs this, and a row already moved off the default is then left alone —
 * deliberately. Re-authoring a value here is a change to what *new* installs get; overwriting a
 * live operator's setting on every prose tweak is the failure `004`'s header describes at length.
 *
 * `updateMany` rather than `update`, on the same reasoning as `003-reclaim-coach-voice`: a database
 * that has never run 002 has no row to update, and a seed that throws over an absent optional row
 * is a worse outcome than one that quietly matches nothing.
 */

import type { SeedUnit } from '@/prisma/runner';
import { reclaimCoachAgent } from '@/lib/app/programme/agent';

/** The `AiAgent.maxTokens` schema default. Only a row still sitting on it is moved. */
const PLATFORM_DEFAULT_MAX_TOKENS = 4096;

/**
 * The platform history cap (`MAX_HISTORY_MESSAGES`, `lib/orchestration/chat/types.ts`) applies when
 * the column is `null` — the agent has expressed no preference. That absence, not a number, is the
 * untouched state this unit is allowed to move.
 */
const UNSET_HISTORY_CAP = null;

const unit: SeedUnit = {
  name: 'app-reclaim/006-reclaim-coach-budget',
  // Relative to this file: the authored values live there, so re-authoring them re-runs this unit.
  hashInputs: ['../../../lib/app/programme/agent.ts'],
  async run({ prisma, logger }) {
    logger.info('🎚  Sizing the reclaim coach token budget...');

    const reservation = await prisma.aiAgent.updateMany({
      where: { slug: reclaimCoachAgent.slug, maxTokens: PLATFORM_DEFAULT_MAX_TOKENS },
      data: { maxTokens: reclaimCoachAgent.maxTokens },
    });
    logger.info(
      reservation.count === 0
        ? `✓  reply reservation left as it is (no row on the ${PLATFORM_DEFAULT_MAX_TOKENS} default — already sized, operator-tuned, or 002 has not run)`
        : `✓  reply reservation set to ${reclaimCoachAgent.maxTokens} (${reservation.count} agent row)`
    );

    const history = await prisma.aiAgent.updateMany({
      where: { slug: reclaimCoachAgent.slug, maxHistoryMessages: UNSET_HISTORY_CAP },
      data: { maxHistoryMessages: reclaimCoachAgent.maxHistoryMessages },
    });
    logger.info(
      history.count === 0
        ? '✓  history cap left as it is (already set, operator-tuned, or 002 has not run)'
        : `✓  history cap set to ${reclaimCoachAgent.maxHistoryMessages} messages (${history.count} agent row)`
    );
  },
};

export default unit;
