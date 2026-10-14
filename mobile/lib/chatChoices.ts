/**
 * Multi-select chip rules for chat questions (pure, unit-tested).
 *
 * A "none" answer can't sit next to a real answer: "None, Pregnant or recently
 * gave birth" reached the planner and it had to guess which one was meant.
 */

/** True for an option that means "none of these". */
export const isExclusiveChoice = (c: string): boolean =>
    /^(none|no|nothing|not really|none of (these|the above)|prefer not to say|n\/a)\b/i.test(String(c || '').trim());

/** The picked set after tapping `choice`: a "none" answer clears the others, any other answer clears "none". */
export function toggleChoice(picked: ReadonlySet<string>, choice: string): Set<string> {
    const next = new Set(picked);
    if (next.has(choice)) {
        next.delete(choice);
        return next;
    }
    if (isExclusiveChoice(choice)) return new Set([choice]);
    for (const c of [...next]) if (isExclusiveChoice(c)) next.delete(c);
    next.add(choice);
    return next;
}
