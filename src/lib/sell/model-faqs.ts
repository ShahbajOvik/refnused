import { formatPrice } from "@/lib/format";
import type { FaqItem } from "@/lib/seo";
import { storeName } from "@/lib/stores";

/*
 * Questions for a sell model page. Pure. The page shows them and emits the
 * same items as FAQPage JSON-LD, so the two can't drift apart. Prices come
 * from the database (the model's highest trade-in price), never from code.
 */

export type SellModelFaqInput = {
  brandName: string;
  name: string;
  maxPricePence: number | null;
  priceLockDays: number;
  dropOffStores: { name: string; town: string }[];
};

function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`;
}

export function sellModelFaqs(m: SellModelFaqInput): FaqItem[] {
  const phone = `${m.brandName} ${m.name}`;
  const isApple = m.brandName.toLowerCase() === "apple";
  const stores = [
    ...new Set(m.dropOffStores.map((s) => storeName({ name: s.name, address: { town: s.town } }))),
  ];

  return [
    ...(m.maxPricePence
      ? [
          {
            question: `How much is my ${phone} worth?`,
            answer: `We pay up to ${formatPrice(m.maxPricePence, { whole: true })} for a ${phone} in excellent condition. Your price depends on its storage and condition: answer a few questions for an instant quote.`,
          },
        ]
      : []),
    {
      question: "How long is my quote guaranteed?",
      answer: `Your price is locked for ${m.priceLockDays} days, so it won’t drop while your phone is on its way to us.`,
    },
    {
      question: `How do I send my ${phone}?`,
      answer: `Post it free with a prepaid label, book a courier collection${
        stores.length ? `, or drop it off at ${listJoin(stores)}` : ""
      }. You’ll get instructions when you accept your quote.`,
    },
    {
      question: "How and when do I get paid?",
      answer:
        "By bank transfer once we’ve checked your phone. If its condition is different from your description, we’ll send you a revised offer first. You can accept it, or we’ll send your phone back to you.",
    },
    {
      question: `What should I do before I send my ${phone}?`,
      answer: isApple
        ? "Back up your iPhone, turn off Find My and sign out of iCloud, remove your SIM, then erase all content and settings. We wipe every phone we buy as well."
        : "Back up your phone, remove your Google account (and Samsung account, if you have one) so the phone isn’t locked to you, take out your SIM and memory card, then factory reset it. We wipe every phone we buy as well.",
    },
    {
      question: "Do you check if a phone is lost, stolen or on finance?",
      answer:
        "Yes. Every phone is checked against the CheckMEND database before we pay for it. We can’t buy phones that are reported lost or stolen, blocked, or still on finance.",
    },
  ];
}
