import { describe, expect, it } from "vitest";

import {
  calculateOffer,
  MIN_ONLINE_OFFER_PENCE,
  PricingError,
  worseGrade,
  type BasePrices,
  type PricingQuestion,
} from "./pricing";

const opt = (
  key: string,
  extra: Partial<PricingQuestion["options"][number]> = {},
): PricingQuestion["options"][number] => ({
  key,
  label: key,
  gradeCap: null,
  deductionBasisPoints: 0,
  deductionPence: 0,
  ...extra,
});

const questions: PricingQuestion[] = [
  {
    key: "network",
    title: "Network",
    options: [opt("unlocked"), opt("locked", { deductionPence: 1000 })],
  },
  {
    key: "powers_on",
    title: "Powers on",
    options: [opt("yes"), opt("no", { gradeCap: "faulty" })],
  },
  {
    key: "screen",
    title: "Screen",
    options: [
      opt("perfect"),
      opt("light", { gradeCap: "B" }),
      opt("heavy", { gradeCap: "C" }),
      opt("cracked", { gradeCap: "faulty" }),
    ],
  },
  {
    key: "body",
    title: "Body",
    options: [opt("perfect"), opt("light", { gradeCap: "B" }), opt("heavy", { gradeCap: "C" })],
  },
  {
    key: "battery",
    title: "Battery",
    options: [
      opt("good"),
      opt("ok", { deductionPence: 1000 }),
      opt("poor", { deductionPence: 2500 }),
    ],
  },
  {
    key: "biometrics",
    title: "Face ID / fingerprint",
    options: [opt("works"), opt("broken", { deductionBasisPoints: 2000 })],
  },
];

const basePrices = { A: 30_000, B: 25_500, C: 19_500, faulty: 7_500 };

const perfect = {
  network: "unlocked",
  powers_on: "yes",
  screen: "perfect",
  body: "perfect",
  battery: "good",
  biometrics: "works",
};

const offer = (answers: Record<string, string>, prices: BasePrices = basePrices) =>
  calculateOffer({ questions, basePrices: prices, answers });

describe("calculateOffer", () => {
  it("pays the grade A price for a perfect phone", () => {
    expect(offer(perfect)).toEqual({
      grade: "A",
      basePricePence: 30_000,
      deductions: [],
      offerPence: 30_000,
      acceptableOnline: true,
    });
  });

  it.each([
    ["light screen wear", { screen: "light" }, "B", 25_500],
    ["heavy body wear", { body: "heavy" }, "C", 19_500],
    ["cracked screen", { screen: "cracked" }, "faulty", 7_500],
    ["doesn't power on", { powers_on: "no" }, "faulty", 7_500],
  ])("%s sets the grade", (_, change, grade, price) => {
    const result = offer({ ...perfect, ...change });
    expect(result.grade).toBe(grade);
    expect(result.offerPence).toBe(price);
  });

  it("uses the worst grade across all answers", () => {
    expect(offer({ ...perfect, screen: "light", body: "heavy" }).grade).toBe("C");
    expect(offer({ ...perfect, screen: "heavy", body: "light" }).grade).toBe("C");
    expect(offer({ ...perfect, screen: "cracked", body: "light" }).grade).toBe("faulty");
  });

  it("subtracts fixed deductions", () => {
    const result = offer({ ...perfect, battery: "poor", network: "locked" });
    expect(result.deductions).toEqual([
      { questionKey: "network", optionKey: "locked", label: "Network: locked", amountPence: 1000 },
      { questionKey: "battery", optionKey: "poor", label: "Battery: poor", amountPence: 2500 },
    ]);
    expect(result.offerPence).toBe(30_000 - 3500);
  });

  it("takes percentage deductions from the graded base price", () => {
    const result = offer({ ...perfect, screen: "light", biometrics: "broken" });
    // 20% of the grade B price, not the grade A price.
    expect(result.deductions[0]!.amountPence).toBe(5100);
    expect(result.offerPence).toBe(25_500 - 5100);
  });

  it("doesn't compound percentages, so answer order never matters", () => {
    const reordered = [...questions].reverse();
    const answers = { ...perfect, biometrics: "broken", battery: "ok", network: "locked" };
    expect(calculateOffer({ questions: reordered, basePrices, answers }).offerPence).toBe(
      offer(answers).offerPence,
    );
  });

  it("rounds down to whole pounds, never up", () => {
    const result = offer({ ...perfect, biometrics: "broken" }, { ...basePrices, A: 12_345 });
    // 12 345 − round(2 469) = 9 876 → £98
    expect(result.offerPence).toBe(9_800);
    expect(result.offerPence % 100).toBe(0);
  });

  it("never goes below zero", () => {
    const result = offer(
      { ...perfect, battery: "poor", network: "locked" },
      { ...basePrices, A: 2_000 },
    );
    expect(result.offerPence).toBe(0);
    expect(result.acceptableOnline).toBe(false);
  });

  it(`can't be accepted online below £${MIN_ONLINE_OFFER_PENCE / 100}`, () => {
    expect(offer(perfect, { ...basePrices, A: 99 }).acceptableOnline).toBe(false);
    expect(offer(perfect, { ...basePrices, A: 100 }).acceptableOnline).toBe(true);
  });

  it("returns only whole-pence integers", () => {
    const result = offer({ ...perfect, biometrics: "broken" }, { ...basePrices, A: 33_333 });
    for (const d of result.deductions) expect(Number.isInteger(d.amountPence)).toBe(true);
    expect(Number.isInteger(result.offerPence)).toBe(true);
  });

  describe("rejects bad input", () => {
    it("missing answers", () => {
      const partial = Object.fromEntries(Object.entries(perfect).filter(([k]) => k !== "battery"));
      expect(() => offer(partial)).toThrow(expect.objectContaining({ code: "missing_answer" }));
    });

    it("answers to questions that don't exist", () => {
      expect(() => offer({ ...perfect, colour: "red" })).toThrow(
        expect.objectContaining({ code: "unknown_question" }),
      );
    });

    it("options that don't exist (e.g. tampered requests)", () => {
      expect(() => offer({ ...perfect, screen: "brand_new" })).toThrow(PricingError);
    });

    it("a grade with no price", () => {
      expect(() =>
        offer({ ...perfect, screen: "cracked" }, { A: 30_000, B: 25_500, C: 19_500 }),
      ).toThrow(expect.objectContaining({ code: "no_price" }));
    });

    it("non-integer or negative prices", () => {
      expect(() => offer(perfect, { ...basePrices, A: 300.5 })).toThrow(RangeError);
      expect(() => offer(perfect, { ...basePrices, A: -1 })).toThrow(RangeError);
    });
  });
});

describe("worseGrade", () => {
  it("orders A < B < C < faulty", () => {
    expect(worseGrade("A", "B")).toBe("B");
    expect(worseGrade("C", "B")).toBe("C");
    expect(worseGrade("faulty", "A")).toBe("faulty");
    expect(worseGrade("A", "A")).toBe("A");
  });
});
