/**
 * Home page copy.
 *
 * TODO (before launch): have the business confirm every promise below.
 * Comparative claims about named competitors must be accurate and
 * verifiable under the UK CAP Code (rules 3.33–3.44) and consumer
 * protection law, so the price promise only states what *we* will do and
 * makes no claims about CeX, Mazuma Mobile or Back Market themselves.
 */

export const howItWorks = [
  {
    title: "Get an instant quote",
    body: "Search for your phone and answer a few quick questions about its condition. You’ll see your price straight away.",
  },
  {
    title: "Send it free or drop it in",
    body: "Post it with a free label, book a courier collection, or bring it to one of our stores.",
  },
  {
    title: "Get paid",
    body: "We check your phone and pay you by bank transfer. If anything’s different from your description, we’ll tell you before going ahead.",
  },
] as const;

export const pricePromise = {
  title: "Our price promise",
  intro:
    "We want to be the best place to sell your phone locally and online. If you find a better offer, tell us.",
  points: [
    "Found a higher quote from CeX, Mazuma Mobile or Back Market for the same model, storage and condition? Show us before you send your phone and we’ll match it.",
    "Your quoted price is locked for a set period, shown with your quote, so it won’t drop while your phone is on its way.",
    "No hidden fees. Postage is free, and the price you’re quoted is the price you’re paid if the condition matches.",
  ],
  smallPrint:
    "Price match applies to genuine, current written quotes for the same device and condition. Full terms will be available before launch.",
} as const;

export const faqs = [
  {
    question: "How is my quote worked out?",
    answer:
      "Your price depends on the model, storage and condition you choose. Prices are updated regularly by our team and calculated on our servers, so the quote you see is the one we honour.",
  },
  {
    question: "How do I send my phone?",
    answer:
      "Choose free post, a courier collection, or drop it in at our North Shields or South Shields store. We’ll give you instructions when you accept your quote.",
  },
  {
    question: "What if my phone’s condition is different from what I said?",
    answer:
      "We’ll send you a revised offer and explain why. You can accept it, or we’ll send your phone back to you.",
  },
  {
    question: "Do you check if a phone is lost, stolen or on finance?",
    answer:
      "Yes. Every phone is checked against the CheckMEND database before we pay for it. We can’t buy phones that are reported lost or stolen, blocked, or still on finance.",
  },
  {
    question: "What happens to my data?",
    answer:
      "Sign out of your accounts and reset your phone before sending it. We securely wipe every device we buy as well, and every refurbished phone we sell comes with a data-wipe certificate.",
  },
  {
    question: "What do the grades mean on refurbished phones?",
    answer:
      "Grades describe how a phone looks, not how it works. Every phone we sell is fully tested. Grade A looks almost new, Grade B has light signs of use and Grade C has visible wear.",
  },
  {
    question: "Do refurbished phones come with a warranty?",
    answer:
      "Yes. Every refurbished phone comes with a warranty, and the length is shown on each listing. Your statutory rights under the Consumer Rights Act are not affected.",
  },
] as const;
