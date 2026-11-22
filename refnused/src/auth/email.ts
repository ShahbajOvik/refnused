import "server-only";

import { magicLinkEmail, type MagicLink } from "@/auth/email-template";
import { logMagicLinksToConsole } from "@refnused/database/lib/env.server";
import { sendEmail } from "@refnused/database/lib/notify/email";
import { writeToOutbox } from "@refnused/database/lib/notify/outbox";

/** Sends a magic link with Resend, or prints it in development. */
export async function sendMagicLink(link: MagicLink) {
  const { subject, text, html } = magicLinkEmail(link);

  if (logMagicLinksToConsole) {
    console.info(`\n[magic link] ${link.area} sign-in for ${link.to}\n${link.url}\n`);
    writeToOutbox({ to: link.to, subject, text });
    return;
  }
  // Errors from sendEmail never include the link (a live credential).
  await sendEmail({ to: link.to, subject, text, html });
}
