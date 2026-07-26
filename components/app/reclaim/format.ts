/**
 * Shared display formatting for the reclaim surfaces.
 *
 * `NO_VALUE` exists so that I2's em-dash ban can be **zero-tolerance** with no allowlist. Six places
 * used `—` as "there is no number here": the comparison table's previous and current columns, the
 * chart's status column, the ideal-hours column, and the trend sparkline with too few points. None
 * of those is a punctuation error, but a guard cannot tell a typographic placeholder from a dash in
 * a sentence, and an exceptions list is the thing that quietly grows until the rule means nothing.
 *
 * An en dash (U+2013) is the right character for the job anyway: it is the conventional "no value"
 * mark in a table, and it is narrower, so a column of them reads as absence rather than as rules.
 */
export const NO_VALUE = '–';
