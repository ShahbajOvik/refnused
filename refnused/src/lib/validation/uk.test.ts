import { describe, expect, it } from "vitest";

import {
  imeiSchema,
  isUkMobile,
  isValidImei,
  luhnValid,
  normaliseUkPhone,
  normaliseUkPostcode,
  ukPostcodeSchema,
  withImeiCheckDigit,
} from "./uk";

describe("IMEI", () => {
  it.each(["490154203237518", "356938035643809", "352099001761481"])(
    "accepts valid IMEI %s",
    (imei) => {
      expect(isValidImei(imei)).toBe(true);
    },
  );

  it.each([
    ["wrong check digit", "490154203237517"],
    ["14 digits", "49015420323751"],
    ["16 digits", "4901542032375180"],
    ["letters", "49015420323751A"],
  ])("rejects %s", (_, imei) => {
    expect(isValidImei(imei)).toBe(false);
  });

  it("computes check digits that pass Luhn", () => {
    expect(withImeiCheckDigit("49015420323751")).toBe("490154203237518");
    expect(luhnValid(withImeiCheckDigit("35000000000001"))).toBe(true);
  });

  it("ignores spaces and dashes typed by people", () => {
    expect(imeiSchema.parse("49-015420 3237518")).toBe("490154203237518");
    expect(imeiSchema.safeParse("490154203237517").error?.issues[0]?.message).toMatch(
      /isn’t valid/,
    );
  });
});

describe("UK postcodes", () => {
  it.each([
    ["ne296rr", "NE29 6RR"],
    ["NE33 1HT", "NE33 1HT"],
    [" sw1a 1aa ", "SW1A 1AA"],
    ["M1 1AE", "M1 1AE"],
    ["B33 8TH", "B33 8TH"],
  ])("%j → %s", (input, expected) => {
    expect(normaliseUkPostcode(input)).toBe(expected);
    expect(ukPostcodeSchema.parse(input)).toBe(expected);
  });

  it.each(["NE29", "12345", "NE29 6R", "ZZZ 1AA"])("rejects %j", (input) => {
    expect(ukPostcodeSchema.safeParse(input).success).toBe(false);
  });
});

describe("UK phone numbers", () => {
  it.each([
    ["07700 900123", "+447700900123"],
    ["+44 7700 900123", "+447700900123"],
    ["0044 7700 900123", "+447700900123"],
    ["0191 380 0456", "+441913800456"],
  ])("%j → %s", (input, expected) => {
    expect(normaliseUkPhone(input)).toBe(expected);
  });

  it.each(["12345", "+1 202 555 0100", "07700 9001", "0800 BUY NOW"])("rejects %j", (input) => {
    expect(normaliseUkPhone(input)).toBeNull();
  });

  it("knows mobiles (for SMS)", () => {
    expect(isUkMobile("+447700900123")).toBe(true);
    expect(isUkMobile("+441913800456")).toBe(false);
  });
});
