import { siteConfig } from "../../config/site";

export type MagicLink = {
  to: string;
  url: string;
  area: "customer" | "staff";
  expiresInMinutes: number;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Subject, plain text and HTML for a sign-in link email. */
export function magicLinkEmail({ url, area, expiresInMinutes }: Omit<MagicLink, "to">) {
  const subject =
    area === "staff" ? `Sign in to ${siteConfig.name} admin` : `Sign in to ${siteConfig.name}`;
  const text = [
    `Use this link to sign in to ${siteConfig.name}${area === "staff" ? " admin" : ""}:`,
    "",
    url,
    "",
    `The link works once and expires in ${expiresInMinutes} minutes.`,
    "If you didn't ask to sign in, you can ignore this email. Nobody can sign in without the link.",
  ].join("\n");
  const safeUrl = escapeHtml(url);
  const html = `<!doctype html>
<html lang="en-GB"><body style="margin:0;padding:24px;background:#f5f6f8;font-family:Arial,Helvetica,sans-serif;color:#1d232b">
<table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
<tr><td>
<p style="margin:0 0 16px;font-size:20px;font-weight:bold">${escapeHtml(subject)}</p>
<p style="margin:0 0 24px;font-size:16px;line-height:1.5">Select the button below to sign in. The link works once and expires in ${expiresInMinutes} minutes.</p>
<p style="margin:0 0 24px"><a href="${safeUrl}" style="display:inline-block;background:#0f7a63;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:8px">Sign in</a></p>
<p style="margin:0 0 8px;font-size:14px;color:#5b6470">Or copy this link into your browser:</p>
<p style="margin:0 0 24px;font-size:14px;word-break:break-all"><a href="${safeUrl}" style="color:#0f7a63">${safeUrl}</a></p>
<p style="margin:0;font-size:14px;color:#5b6470">If you didn't ask to sign in, you can ignore this email.</p>
</td></tr></table></body></html>`;
  return { subject, text, html };
}
