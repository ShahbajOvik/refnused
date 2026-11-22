import { describe, expect, it } from "vitest";

import { isSameOriginRequest } from "./same-origin";

const SITE = "https://www.example.co.uk";
const req = (headers: Record<string, string>) =>
  new Request(`${SITE}/admin/upload`, { method: "POST", headers });

describe("isSameOriginRequest", () => {
  it("allows the site's own pages", () => {
    expect(isSameOriginRequest(req({ origin: SITE, "sec-fetch-site": "same-origin" }), SITE)).toBe(
      true,
    );
    expect(isSameOriginRequest(req({ origin: SITE }), SITE)).toBe(true);
    expect(isSameOriginRequest(req({ "sec-fetch-site": "same-origin" }), SITE)).toBe(true);
  });

  it("blocks other sites, including our own subdomains", () => {
    expect(
      isSameOriginRequest(
        req({ origin: "https://evil.example", "sec-fetch-site": "cross-site" }),
        SITE,
      ),
    ).toBe(false);
    expect(
      isSameOriginRequest(
        req({ origin: "https://shop.example.co.uk", "sec-fetch-site": "same-site" }),
        SITE,
      ),
    ).toBe(false);
    expect(isSameOriginRequest(req({ origin: "https://evil.example" }), SITE)).toBe(false);
    expect(isSameOriginRequest(req({ origin: "null" }), SITE)).toBe(false);
  });

  it("blocks requests with no evidence of where they came from", () => {
    expect(isSameOriginRequest(req({}), SITE)).toBe(false);
    expect(isSameOriginRequest(req({ "sec-fetch-site": "none" }), SITE)).toBe(false);
  });
});
