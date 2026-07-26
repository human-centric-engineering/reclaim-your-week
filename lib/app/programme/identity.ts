/**
 * The module's stable identifiers, in a file that depends on nothing.
 *
 * These live apart from `./module.ts` for one reason: low-level code needs them. `slots/write.ts`
 * stamps every slot value with the module slug, and the coach's capabilities are declared *on* the
 * module definition, so keeping the constants in `module.ts` makes a cycle
 * (`module → capability → write → module`). ESM tolerates it right up until an import order changes
 * and a constant is read during the temporal dead zone, which is the sort of failure this codebase
 * goes out of its way not to leave lying around.
 *
 * `module.ts` re-exports both, so every existing import site keeps working and there is still one
 * obvious place to find them.
 */

/** The module's stable slug — the storage key everywhere (`Module.slug`). Never changes. */
export const RECLAIM_MODULE_SLUG = 'reclaim-audit';

/** The agent seat this module offers. `reclaimCoachAgent` (`./agent.ts`) is authored for it. */
export const RECLAIM_COACH_ROLE = 'coach';
