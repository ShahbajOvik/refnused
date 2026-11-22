/**
 * An expected failure whose message is safe to show the user, e.g.
 * "You can't deactivate yourself". Admin actions turn it into
 * `{ ok: false, error }`; any other error is a bug and is rethrown.
 */
export class ActionError extends Error {
  override name = "ActionError";
}
