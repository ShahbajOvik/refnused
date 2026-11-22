import "server-only";

import { getRequestMeta } from "@/lib/request-meta";

import { BOT_CHECK_FAILED, isRateLimited, passesBotCheck, TOO_MANY_REQUESTS } from "./guards";
import { TURNSTILE_FIELD } from "./turnstile-field";

/**
 * Checks before emailing a sign-in link: Turnstile, then per-IP and
 * per-address limits, so the form can't be used to flood someone's inbox.
 * Returns an error to show, or null to go ahead. The Auth.js endpoint that
 * would send links directly is blocked (src/lib/security/auth-routes.ts), so
 * every link goes through here.
 */
export async function magicLinkGuard(
  area: "customer" | "staff",
  email: string,
  formData: FormData,
): Promise<string | null> {
  const meta = await getRequestMeta();
  const token = formData.get(TURNSTILE_FIELD);
  if (
    !(await passesBotCheck(
      typeof token === "string" ? token : null,
      `${area}_sign_in`,
      meta.ipAddress,
    ))
  ) {
    return BOT_CHECK_FAILED;
  }
  if (await isRateLimited(`signin:${area}:ip`, meta.ipAddress ?? "unknown", 10, 3600)) {
    return TOO_MANY_REQUESTS;
  }
  if (await isRateLimited(`signin:${area}:email`, email.toLowerCase(), 5, 3600)) {
    return TOO_MANY_REQUESTS;
  }
  return null;
}
