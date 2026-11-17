/**
 * Cloudflare Turnstile server-side verification.
 * https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileResult = { success: boolean; errorCodes: string[] };

export async function verifyTurnstile(
  token: string | null | undefined,
  options: {
    secret: string;
    remoteIp?: string | null;
    /** Expected action name set on the widget. */
    action?: string;
    fetchImpl?: typeof fetch;
  },
): Promise<TurnstileResult> {
  if (!token || token.length > 2048)
    return { success: false, errorCodes: ["missing-input-response"] };

  const body = new URLSearchParams({ secret: options.secret, response: token });
  if (options.remoteIp) body.set("remoteip", options.remoteIp);

  try {
    const response = await (options.fetchImpl ?? fetch)(VERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5000),
    });
    const data = (await response.json()) as {
      success: boolean;
      action?: string;
      "error-codes"?: string[];
    };
    if (data.success && options.action && data.action !== options.action) {
      return { success: false, errorCodes: ["action-mismatch"] };
    }
    return { success: data.success === true, errorCodes: data["error-codes"] ?? [] };
  } catch {
    // Fail closed: if we can't verify, don't accept the submission.
    return { success: false, errorCodes: ["verification-unavailable"] };
  }
}
