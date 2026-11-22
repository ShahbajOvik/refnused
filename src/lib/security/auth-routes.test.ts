import { describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

import { isDirectEmailSignIn, withoutDirectEmailSignIn } from "./auth-routes";

describe("withoutDirectEmailSignIn", () => {
  it("closes the magic-link endpoint on both Auth.js instances", async () => {
    const handler = vi.fn(async () => new Response("ok"));
    const wrapped = withoutDirectEmailSignIn(handler);
    for (const url of [
      "https://x.test/api/auth/signin/resend",
      "https://x.test/api/staff-auth/signin/resend/",
    ]) {
      const response = await wrapped(new Request(url, { method: "POST" }) as NextRequest);
      expect(response.status).toBe(404);
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it("passes everything else through", async () => {
    const handler = vi.fn(async () => new Response("ok"));
    const wrapped = withoutDirectEmailSignIn(handler);
    for (const path of [
      "/api/auth/session",
      "/api/auth/csrf",
      "/api/auth/callback/resend",
      "/api/auth/signin/google",
    ]) {
      expect((await wrapped(new Request(`https://x.test${path}`) as NextRequest)).status).toBe(200);
    }
    expect(isDirectEmailSignIn("/api/auth/callback/resend")).toBe(false);
  });
});
