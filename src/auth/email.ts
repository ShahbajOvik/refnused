import "server-only";

import { magicLinkEmail, type MagicLink } from "@/auth/email-template";
import { logMagicLinksToConsole, serverEnv } from "@/lib/env.server";

/** Sends a magic link with Resend, or prints it in development. */
export async function sendMagicLink(link: MagicLink) {
  const { subject, text, html } = magicLinkEmail(link);

  if (logMagicLinksToConsole) {
    console.info(`\n[magic link] ${link.area} sign-in for ${link.to}\n${link.url}\n`);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serverEnv.AUTH_RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: serverEnv.EMAIL_FROM, to: link.to, subject, text, html }),
  });
  if (!response.ok) {
    // Don't include the link (a live credential) in errors or logs.
    throw new Error(`Resend error ${response.status}`);
  }
}
