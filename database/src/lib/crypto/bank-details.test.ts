import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { decryptBankDetails, encryptBankDetails } from "./bank-details";
import { createFieldCipher, FieldEncryptionError, parseKeyring } from "./field-encryption";

const key = () => randomBytes(32).toString("base64");
const cipherWith = (value: string) => createFieldCipher(parseKeyring(value));

describe("field encryption", () => {
  const cipher = cipherWith(`k1:${key()}`);

  it("round-trips a value", () => {
    const payload = cipher.encrypt("12345678", "payouts.account_number");
    expect(payload).not.toContain("12345678");
    expect(payload.startsWith("k1.")).toBe(true);
    expect(cipher.decrypt(payload, "payouts.account_number")).toBe("12345678");
  });

  it("uses a fresh IV each time", () => {
    const a = cipher.encrypt("same", "ctx");
    const b = cipher.encrypt("same", "ctx");
    expect(a).not.toBe(b);
  });

  it("rejects a ciphertext used in a different column", () => {
    const payload = cipher.encrypt("123456", "payouts.sort_code");
    expect(() => cipher.decrypt(payload, "payouts.account_number")).toThrow(FieldEncryptionError);
  });

  it("rejects tampered ciphertext", () => {
    const payload = cipher.encrypt("12345678", "ctx");
    const parts = payload.split(".");
    const ct = Buffer.from(parts[3]!, "base64url");
    ct[0]! ^= 1;
    parts[3] = ct.toString("base64url");
    expect(() => cipher.decrypt(parts.join("."), "ctx")).toThrow("Could not decrypt value");
  });

  it("rejects a value encrypted with a different key", () => {
    const other = cipherWith(`k1:${key()}`);
    expect(() => other.decrypt(cipher.encrypt("x", "ctx"), "ctx")).toThrow(FieldEncryptionError);
  });

  it("supports key rotation: encrypts with the first key, decrypts with any", () => {
    const oldKey = key();
    const before = cipherWith(`k1:${oldKey}`);
    const legacy = before.encrypt("old secret", "ctx");

    const rotated = cipherWith(`k2:${key()},k1:${oldKey}`);
    expect(rotated.decrypt(legacy, "ctx")).toBe("old secret");
    expect(rotated.encrypt("new", "ctx").startsWith("k2.")).toBe(true);
  });

  it.each([
    ["", "not set"],
    ["k1", 'look like "k1:<base64>"'],
    [`k1:${randomBytes(16).toString("base64")}`, "must be 32 bytes"],
    [`k1:${key()},k1:${key()}`, "Duplicate"],
  ])("rejects bad keyring %#", (value, message) => {
    expect(() => parseKeyring(value)).toThrow(message);
  });
});

describe("bank details", () => {
  const cipher = cipherWith(`k1:${key()}`);

  it("normalises, encrypts and keeps only the last 4 digits in clear", () => {
    const encrypted = encryptBankDetails(
      { accountHolderName: "  Jane Smith ", sortCode: "12-34-56", accountNumber: "1234 5678" },
      cipher,
    );
    expect(encrypted.accountNumberLast4).toBe("5678");
    expect(JSON.stringify(encrypted)).not.toMatch(/Jane|123456|12345678/);

    expect(decryptBankDetails(encrypted, cipher)).toEqual({
      accountHolderName: "Jane Smith",
      sortCode: "123456",
      accountNumber: "12345678",
    });
  });

  it.each([
    { sortCode: "12345", accountNumber: "12345678" },
    { sortCode: "123456", accountNumber: "1234567" },
    { sortCode: "12-34-5a", accountNumber: "12345678" },
  ])("rejects invalid details %#", (details) => {
    expect(() =>
      encryptBankDetails({ accountHolderName: "J Smith", ...details }, cipher),
    ).toThrow();
  });
});
