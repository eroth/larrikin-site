// What to do with the Turnstile widget once the join form has been sent.
//
// A token only works once, so a failed send needs a fresh challenge (reset) in case the visitor
// tries again. A successful send ends the conversation, so the widget is removed instead of reset:
// a reset starts a new challenge, which can show a "Verify you are human" box under "All done".

/**
 * @param {{ remove(id: string): void, reset(id: string): void } | undefined} turnstile
 * @param {string | undefined} widgetId
 * @param {boolean} delivered
 * @returns {string | undefined} the widget id still in use (undefined once the widget is gone)
 */
export function settleTurnstile(turnstile, widgetId, delivered) {
  if (!turnstile || widgetId === undefined) return widgetId;
  if (delivered) {
    turnstile.remove(widgetId);
    return undefined;
  }
  turnstile.reset(widgetId);
  return widgetId;
}
