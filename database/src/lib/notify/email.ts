import "server-only";

import { logMagicLinksToConsole, serverEnv } from "../env.server";

import { writeToOutbox } from "./outbox";

export type EmailMessage = { to: string; subject: string; text: string; html: string };

/** Sends an email with Resend, or prints it in development. */
export async function sendEmail(message: EmailMessage) {
  if (logMagicLinksToConsole) {
    console.info(`\n[email] to ${message.to}: ${message.subject}\n${message.text}\n`);
    writeToOutbox(message);
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serverEnv.AUTH_RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: serverEnv.EMAIL_FROM, ...message }),
    signal: AbortSignal.timeout(10_000),
  });
  // Never include message content in errors: it may contain links or personal data.
  if (!response.ok) throw new Error(`Resend error ${response.status}`);
}
