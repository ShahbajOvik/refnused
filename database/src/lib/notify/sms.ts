import "server-only";

import { serverEnv, smsEnabled } from "../env.server";

/** Sends an SMS with Twilio's REST API, or prints it in development. */
export async function sendSms(to: string, body: string) {
  if (!smsEnabled) {
    console.info(`\n[sms] to ${to}: ${body}\n`);
    return;
  }
  const sid = serverEnv.TWILIO_ACCOUNT_SID!;
  const from = serverEnv.TWILIO_FROM!;
  const params = new URLSearchParams({ To: to, Body: body });
  params.set(from.startsWith("MG") ? "MessagingServiceSid" : "From", from);

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${serverEnv.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Twilio error ${response.status}`);
}
