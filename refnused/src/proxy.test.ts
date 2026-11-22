// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

const { proxy } = await import("@/proxy");
const { CUSTOMER_SESSION_COOKIE } = await import("@/auth/cookies");

function request(
  path: string,
  cookies: Record<string, string> = {},
  headers: Record<string, string> = {},
) {
  const cookie = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: { ...(cookie ? { cookie } : {}), ...headers },
  });
}

describe("proxy: /account", () => {
  it("redirects to sign-in without a customer session", async () => {
    const res = await proxy(request("/account/orders?x=1"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/sign-in?callbackUrl=%2Faccount%2Forders%3Fx%3D1",
    );
  });

  it("lets a customer session through (the page validates it)", async () => {
    const res = await proxy(request("/account", { [CUSTOMER_SESSION_COOKIE]: "abc" }));
    expect(res.headers.get("location")).toBeNull();
  });

  it("does not accept a staff cookie as a customer session", async () => {
    const res = await proxy(request("/account", { ["ru.staff-session"]: "abc" }));
    expect(res.headers.get("location")).toContain("/sign-in");
  });
});

describe("proxy: security headers", () => {
  it("sets a strict nonce CSP and no referrer on secret-link pages", async () => {
    const res = await proxy(request("/orders/abcdefghijklmnopqrstuv"));
    expect(res.headers.get("content-security-policy")).toMatch(/'nonce-[^']+' 'strict-dynamic'/);
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });
});
