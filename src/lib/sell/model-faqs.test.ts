import { describe, expect, it } from "vitest";

import { faqPageJsonLd } from "@/lib/seo";

import { sellModelFaqs } from "./model-faqs";

const base = {
  brandName: "Apple",
  name: "iPhone 15",
  maxPricePence: 31_500,
  priceLockDays: 14,
  dropOffStores: [
    { name: "MetroTech", town: "North Shields" },
    { name: "FairTech", town: "South Shields" },
    { name: "FairTech", town: "North Shields" },
  ],
};

describe("sellModelFaqs", () => {
  it("answers 'how much is it worth' with the live top price", () => {
    const [first] = sellModelFaqs(base);
    expect(first!.question).toBe("How much is my Apple iPhone 15 worth?");
    expect(first!.answer).toContain("up to £315");
  });

  it("leaves the price question out when there's no price", () => {
    const faqs = sellModelFaqs({ ...base, maxPricePence: null });
    expect(faqs.map((f) => f.question)).not.toContain("How much is my Apple iPhone 15 worth?");
  });

  it("names every drop-off store with the NAP name helper", () => {
    const send = sellModelFaqs(base).find((f) => f.question.startsWith("How do I send"))!;
    expect(send.answer).toContain(
      "drop it off at MetroTech, North Shields, FairTech, South Shields or FairTech, North Shields",
    );
  });

  it("uses the price lock period from the server", () => {
    const lock = sellModelFaqs(base).find((f) => f.question.includes("guaranteed"))!;
    expect(lock.answer).toContain("locked for 14 days");
  });

  it("gives Android wipe steps for other brands", () => {
    const wipe = sellModelFaqs({ ...base, brandName: "Samsung", name: "Galaxy S24" }).find((f) =>
      f.question.startsWith("What should I do"),
    )!;
    expect(wipe.answer).toContain("Google account");
    expect(wipe.answer).not.toContain("iCloud");
  });

  it("feeds FAQPage JSON-LD with the same questions and answers", () => {
    const faqs = sellModelFaqs(base);
    const data = faqPageJsonLd(faqs);
    expect(data["@type"]).toBe("FAQPage");
    expect(data.mainEntity).toHaveLength(faqs.length);
    expect(data.mainEntity[0]).toEqual({
      "@type": "Question",
      name: faqs[0]!.question,
      acceptedAnswer: { "@type": "Answer", text: faqs[0]!.answer },
    });
  });
});
