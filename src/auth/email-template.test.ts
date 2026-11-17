import { describe, expect, it } from "vitest";

import { magicLinkEmail } from "@/auth/email-template";

describe("magic link email", () => {
  it("includes the link and expiry in both HTML and text", () => {
    const email = magicLinkEmail({
      url: "https://refurbednused.example/api/auth/callback/resend?token=abc&email=a%40b.com",
      area: "customer",
      expiresInMinutes: 30,
    });
    expect(email.subject).toBe("Sign in to RefurbednUsed");
    expect(email.text).toContain("token=abc&email=a%40b.com");
    expect(email.text).toContain("30 minutes");
    expect(email.html).toContain('lang="en-GB"');
    expect(email.html).toContain("token=abc&#38;email=a%40b.com");
  });

  it("escapes the URL so it can't inject HTML", () => {
    const email = magicLinkEmail({
      url: 'https://x.example/"><script>alert(1)</script>',
      area: "staff",
      expiresInMinutes: 10,
    });
    expect(email.html).not.toContain("<script>");
    expect(email.subject).toBe("Sign in to RefurbednUsed admin");
  });
});
