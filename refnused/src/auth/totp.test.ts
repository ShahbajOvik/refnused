import { describe, expect, it } from "vitest";

import {
  base32Decode,
  base32Encode,
  generateTotp,
  generateTotpSecret,
  hotp,
  totpUri,
  verifyTotp,
} from "@/auth/totp";

// RFC 6238 appendix B, SHA-1 secret: ASCII "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));
const at = (seconds: number) => new Date(seconds * 1000);

describe("base32", () => {
  it("matches RFC 4648 test vectors", () => {
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
    expect(base32Decode("MZXW6YTBOI").toString()).toBe("foobar");
  });

  it("round-trips random secrets", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(secret))).toBe(secret);
  });

  it("rejects invalid characters", () => {
    expect(() => base32Decode("ABC1")).toThrow();
  });
});

describe("HOTP/TOTP", () => {
  it("matches RFC 4226 HOTP vectors", () => {
    const secret = Buffer.from("12345678901234567890");
    expect(hotp(secret, 0)).toBe("755224");
    expect(hotp(secret, 9)).toBe("520489");
  });

  it.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ])("matches RFC 6238 vector at T=%i", (seconds, code) => {
    expect(generateTotp(RFC_SECRET, at(seconds))).toBe(code);
  });
});

describe("verifyTotp", () => {
  const now = at(1234567890);

  it("accepts the current code and returns its time step", () => {
    expect(verifyTotp(RFC_SECRET, "005924", { at: now })).toBe(Math.floor(1234567890 / 30));
  });

  it("accepts codes one step either side for clock drift", () => {
    expect(
      verifyTotp(RFC_SECRET, generateTotp(RFC_SECRET, at(1234567860)), { at: now }),
    ).not.toBeNull();
    expect(
      verifyTotp(RFC_SECRET, generateTotp(RFC_SECRET, at(1234567920)), { at: now }),
    ).not.toBeNull();
  });

  it("rejects codes two steps away", () => {
    expect(
      verifyTotp(RFC_SECRET, generateTotp(RFC_SECRET, at(1234567830)), { at: now }),
    ).toBeNull();
  });

  it("rejects a code that was already used (replay)", () => {
    const step = verifyTotp(RFC_SECRET, "005924", { at: now })!;
    expect(verifyTotp(RFC_SECRET, "005924", { at: now, lastUsedStep: step })).toBeNull();
  });

  it.each(["", "12345", "1234567", "abcdef", "00592a"])("rejects malformed code %j", (code) => {
    expect(verifyTotp(RFC_SECRET, code, { at: now })).toBeNull();
  });

  it("ignores spaces", () => {
    expect(verifyTotp(RFC_SECRET, "005 924", { at: now })).not.toBeNull();
  });
});

describe("totpUri", () => {
  it("builds an otpauth URI authenticator apps understand", () => {
    const uri = totpUri("JBSWY3DPEHPK3PXP", "jo@example.com", "RefurbednUsed");
    expect(uri).toBe(
      "otpauth://totp/RefurbednUsed%3Ajo%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=RefurbednUsed&algorithm=SHA1&digits=6&period=30",
    );
  });
});
