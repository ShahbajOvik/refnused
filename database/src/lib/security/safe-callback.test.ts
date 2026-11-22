import { describe, expect, it } from "vitest";

import { safeCallbackUrl } from "./safe-callback";

describe("safeCallbackUrl", () => {
  it.each([
    ["/admin/staff", "/admin/staff"],
    ["/account?tab=orders", "/account?tab=orders"],
    ["https://evil.example", "/fallback"],
    ["//evil.example", "/fallback"],
    ["/\\evil.example", "/fallback"],
    ["/\t/evil.example", "/fallback"],
    ["/\n/evil.example", "/fallback"],
    ["/\r\n/evil.example", "/fallback"],
    ["/ /evil.example", "/fallback"],
    ["/\u0000/evil.example", "/fallback"],
    ["javascript:alert(1)", "/fallback"],
    [undefined, "/fallback"],
    [["/a", "/b"], "/fallback"],
  ])("%j → %s", (input, expected) => {
    expect(safeCallbackUrl(input, "/fallback")).toBe(expected);
  });
});
