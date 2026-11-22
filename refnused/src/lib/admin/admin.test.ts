import { describe, expect, it } from "vitest";

import { csvCell, parseCsv, toCsv } from "@/lib/csv";

import { calculateMargin } from "./margin";
import { startOfLondonDay } from "./time";

describe("csv", () => {
  it("round-trips quotes, commas and new lines", () => {
    const csv = toCsv(
      ["a", "b"],
      [
        ["x, y", 'say "hi"'],
        ["line\nbreak", 5],
      ],
    );
    expect(parseCsv(csv)).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["line\nbreak", "5"],
    ]);
  });

  it("neutralises spreadsheet formulas in text", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("+44")).toBe("'+44");
    expect(csvCell(-5)).toBe("-5");
  });

  it("ignores a byte-order mark and blank lines", () => {
    expect(parseCsv("﻿a,b\r\n\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("calculateMargin", () => {
  it("takes off buy price, refurbishment, card fees and margin-scheme VAT", () => {
    expect(
      calculateMargin({ buyPence: 26000, refurbPence: 2000, sellPence: 46900, marginScheme: true }),
    ).toEqual({
      feesPence: 724, // 1.5% + 20p
      vatPence: 3483, // (469 − 260) / 6
      profitPence: 46900 - 26000 - 2000 - 724 - 3483,
      marginPercent: 31.3,
    });
  });

  it("has no VAT on a loss and handles zero", () => {
    expect(
      calculateMargin({ buyPence: 30000, refurbPence: 0, sellPence: 25000, marginScheme: true })
        .vatPence,
    ).toBe(0);
    expect(
      calculateMargin({ buyPence: 0, refurbPence: 0, sellPence: 0, marginScheme: false }),
    ).toEqual({
      feesPence: 0,
      vatPence: 0,
      profitPence: 0,
      marginPercent: 0,
    });
    expect(() =>
      calculateMargin({ buyPence: 1.5, refurbPence: 0, sellPence: 0, marginScheme: false }),
    ).toThrow(RangeError);
  });
});

describe("startOfLondonDay", () => {
  it("uses London midnight in winter and summer", () => {
    expect(startOfLondonDay(new Date("2026-11-18T15:00:00Z")).toISOString()).toBe(
      "2026-11-18T00:00:00.000Z",
    );
    expect(startOfLondonDay(new Date("2026-07-01T10:00:00Z")).toISOString()).toBe(
      "2026-06-30T23:00:00.000Z",
    );
    expect(startOfLondonDay(new Date("2026-07-01T23:30:00Z")).toISOString()).toBe(
      "2026-07-01T23:00:00.000Z",
    );
    expect(startOfLondonDay(new Date("2026-11-18T15:00:00Z"), 7).toISOString()).toBe(
      "2026-11-11T00:00:00.000Z",
    );
  });
});
