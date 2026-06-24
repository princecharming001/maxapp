/**
 * One-shot signal that a user-initiated subscription purchase was just verified,
 * so the app should route into the post-pay flow (FaceScanResults) once the paid
 * stack has mounted.
 *
 * Why a flag instead of a direct navigate() from the purchase handler: when the
 * purchase verifies we call refreshUser(), which flips `isPaid` and REMOUNTS the
 * whole navigator (RootNavigator keys its Stack.Navigator on paid state). A
 * navigate() fired from the handler races — and loses to — that remount. So the
 * handler just sets this flag; App.tsx consumes it in an effect that runs AFTER
 * `isPaid` becomes true (i.e. after the paid stack has mounted).
 *
 * Why a flag instead of reacting to the isPaid transition alone: an existing
 * paid user opening the app also transitions isPaid false→true during load — we
 * must NOT drop them into the purchase-celebration flow. Only a real purchase
 * sets this.
 */
let pending = false;

export const markPostPayPending = (): void => {
    pending = true;
};

/** Returns true exactly once after a purchase, then resets. */
export const consumePostPayPending = (): boolean => {
    const was = pending;
    pending = false;
    return was;
};
