/**
 * Seed catalogue: 10 popular models we buy and sell.
 * Trade-in prices are SAMPLE values for development, not real offers.
 */

export type SeedModel = {
  brand: "apple" | "samsung" | "google";
  name: string;
  slug: string;
  releaseYear: number;
  storageGb: number[];
  colours: string[];
  /** Sample trade-in price in pence for the smallest storage at grade A. */
  baseTradeInPence: number;
};

export const seedCategories = [
  {
    slug: "phones",
    name: "Phones",
    sortOrder: 1,
    identifierType: "imei",
    hasStorage: true,
    hasBattery: true,
    requiresDataWipe: true,
  },
  {
    slug: "laptops",
    name: "Laptops",
    sortOrder: 2,
    identifierType: "serial",
    hasStorage: true,
    hasBattery: true,
    requiresDataWipe: true,
  },
] as const;

export const seedBrands = [
  { slug: "apple", name: "Apple", sortOrder: 1 },
  { slug: "samsung", name: "Samsung", sortOrder: 2 },
  { slug: "google", name: "Google", sortOrder: 3 },
] as const;

export const seedModels: SeedModel[] = [
  {
    brand: "apple",
    name: "iPhone 17 Pro",
    slug: "iphone-17-pro",
    releaseYear: 2025,
    storageGb: [256, 512, 1024],
    colours: ["Cosmic Orange", "Deep Blue", "Silver"],
    baseTradeInPence: 62000,
  },
  {
    brand: "apple",
    name: "iPhone 16",
    slug: "iphone-16",
    releaseYear: 2024,
    storageGb: [128, 256, 512],
    colours: ["Black", "White", "Pink", "Teal", "Ultramarine"],
    baseTradeInPence: 33000,
  },
  {
    brand: "apple",
    name: "iPhone 15",
    slug: "iphone-15",
    releaseYear: 2023,
    storageGb: [128, 256, 512],
    colours: ["Black", "Blue", "Green", "Yellow", "Pink"],
    baseTradeInPence: 26000,
  },
  {
    brand: "apple",
    name: "iPhone 13",
    slug: "iphone-13",
    releaseYear: 2021,
    storageGb: [128, 256, 512],
    colours: ["Midnight", "Starlight", "Blue", "Pink", "Green", "(PRODUCT)RED"],
    baseTradeInPence: 15000,
  },
  {
    brand: "samsung",
    name: "Galaxy S25 Ultra",
    slug: "galaxy-s25-ultra",
    releaseYear: 2025,
    storageGb: [256, 512, 1024],
    colours: ["Titanium Silverblue", "Titanium Black", "Titanium Gray", "Titanium Whitesilver"],
    baseTradeInPence: 48000,
  },
  {
    brand: "samsung",
    name: "Galaxy S24",
    slug: "galaxy-s24",
    releaseYear: 2024,
    storageGb: [128, 256],
    colours: ["Onyx Black", "Marble Grey", "Cobalt Violet", "Amber Yellow"],
    baseTradeInPence: 19000,
  },
  {
    brand: "samsung",
    name: "Galaxy A55",
    slug: "galaxy-a55",
    releaseYear: 2024,
    storageGb: [128, 256],
    colours: ["Awesome Navy", "Awesome Iceblue", "Awesome Lilac", "Awesome Lemon"],
    baseTradeInPence: 8500,
  },
  {
    brand: "google",
    name: "Pixel 10 Pro",
    slug: "pixel-10-pro",
    releaseYear: 2025,
    storageGb: [128, 256, 512],
    colours: ["Obsidian", "Porcelain", "Moonstone", "Jade"],
    baseTradeInPence: 40000,
  },
  {
    brand: "google",
    name: "Pixel 9",
    slug: "pixel-9",
    releaseYear: 2024,
    storageGb: [128, 256],
    colours: ["Obsidian", "Porcelain", "Wintergreen", "Peony"],
    baseTradeInPence: 20000,
  },
  {
    brand: "google",
    name: "Pixel 8a",
    slug: "pixel-8a",
    releaseYear: 2024,
    storageGb: [128, 256],
    colours: ["Obsidian", "Porcelain", "Bay", "Aloe"],
    baseTradeInPence: 9500,
  },
];

/** Share of the grade A price paid for each condition (sample policy). */
export const SAMPLE_GRADE_MULTIPLIER = { A: 1, B: 0.85, C: 0.65, faulty: 0.25 } as const;

/** Each storage step up adds this share of the base price (sample policy). */
export const SAMPLE_STORAGE_STEP = 0.1;

/**
 * Sample trade-in price, rounded down to the nearest £5.
 * Seed data only. Live prices are set by staff in trade_in_prices.
 */
export function sampleTradeInPence(
  basePence: number,
  storageIndex: number,
  grade: keyof typeof SAMPLE_GRADE_MULTIPLIER,
): number {
  const raw = basePence * (1 + SAMPLE_STORAGE_STEP * storageIndex) * SAMPLE_GRADE_MULTIPLIER[grade];
  return Math.floor(raw / 500) * 500;
}

export type SeedProduct = {
  model: string;
  storageGb: number;
  colour: string;
  grade: "A" | "B" | "C";
  batteryHealthPercent: number;
  /** SAMPLE retail price in pence. */
  pricePence: number;
  storeSlug: string;
  /** 14 digits; the check digit is added. Fake TAC "35000000" marks sample units. */
  imeiBody: string;
  /** Fixed slug suffix so sample URLs are stable between seeds. */
  slugSuffix: string;
  status?: "listed" | "reserved" | "sold";
  warrantyMonths?: number;
};

/** Sample unit photos in public/media/sample (rendered by npm run media:samples). */
export const SAMPLE_PHOTO_VIEWS = [
  { view: "front", alt: "Front of this" },
  { view: "back", alt: "Back of this" },
  { view: "angle", alt: "Angled view of this" },
  { view: "side", alt: "Side of this" },
] as const;

const MT = "metrotech-north-shields";
const FT = "fairtech-south-shields";

/** SAMPLE refurbished stock so the shop and home page have something to show. */
export const seedProducts: SeedProduct[] = [
  // prettier-ignore
  ...([
    ["iphone-15", 128, "Black", "A", 96, 46900, MT, "k3x9q2"],
    ["galaxy-s24", 256, "Cobalt Violet", "A", 93, 39900, FT, "m7c4ta"],
    ["pixel-9", 128, "Obsidian", "B", 91, 32900, MT, "p2h8vd"],
    ["iphone-13", 128, "Midnight", "B", 87, 25900, FT, "r5n3wk"],
    ["iphone-16", 128, "Ultramarine", "A", 99, 59900, MT, "t9b6xe"],
    ["galaxy-a55", 128, "Awesome Navy", "C", 88, 15900, FT, "w4f7yh"],
    ["iphone-15", 128, "Blue", "B", 91, 42900, FT, "a6d2kq"],
    ["iphone-15", 256, "Black", "A", 94, 51900, FT, "b8e5mr"],
    ["iphone-15", 128, "Pink", "C", 84, 37900, MT, "c3g9ns"],
    ["iphone-17-pro", 256, "Cosmic Orange", "A", 100, 99900, MT, "d5h4pt"],
    ["iphone-17-pro", 512, "Deep Blue", "A", 99, 112900, FT, "e7j8qv"],
    ["iphone-16", 256, "Black", "B", 95, 57900, FT, "f2k3rw"],
    ["iphone-13", 256, "Starlight", "A", 89, 29900, MT, "g4m6sx"],
    ["iphone-13", 128, "(PRODUCT)RED", "C", 82, 21900, MT, "h6n2ty"],
    ["galaxy-s25-ultra", 256, "Titanium Black", "A", 98, 84900, MT, "j8p5uz"],
    ["galaxy-s25-ultra", 512, "Titanium Silverblue", "B", 96, 82900, FT, "k2q7va"],
    ["galaxy-s24", 128, "Onyx Black", "B", 90, 33900, MT, "m4r9wb"],
    ["galaxy-a55", 256, "Awesome Lilac", "A", 94, 22900, MT, "n6s3xc"],
    ["pixel-10-pro", 128, "Obsidian", "A", 99, 69900, FT, "p8t5yd"],
    ["pixel-10-pro", 256, "Moonstone", "B", 97, 67900, MT, "q2v7ze"],
    ["pixel-9", 256, "Porcelain", "A", 93, 38900, FT, "r4w9af"],
    ["pixel-8a", 128, "Bay", "B", 88, 21900, FT, "s6x2bg"],
    ["pixel-8a", 128, "Obsidian", "C", 81, 17900, MT, "t8y4ch"],
    ["iphone-16", 128, "Pink", "A", 98, 61900, FT, "v2z6dj"],
    ["galaxy-s24", 256, "Marble Grey", "C", 85, 29900, FT, "w4a8ek"],
    ["iphone-15", 512, "Green", "B", 92, 55900, MT, "x6b3fm"],
  ] as const).map(([model, storageGb, colour, grade, battery, pricePence, storeSlug, slugSuffix], i) => ({
    model,
    storageGb,
    colour,
    grade,
    batteryHealthPercent: battery,
    pricePence,
    storeSlug,
    slugSuffix,
    imeiBody: `350000000000${String(i + 1).padStart(2, "0")}`,
  })),
  // Sold and reserved units keep their pages (notify-me + similar phones).
  {
    model: "iphone-15",
    storageGb: 128,
    colour: "Yellow",
    grade: "A",
    batteryHealthPercent: 97,
    pricePence: 47900,
    storeSlug: MT,
    imeiBody: "35000000000090",
    slugSuffix: "y8c5gn",
    status: "sold",
  },
  {
    model: "pixel-9",
    storageGb: 128,
    colour: "Peony",
    grade: "B",
    batteryHealthPercent: 90,
    pricePence: 31900,
    storeSlug: FT,
    imeiBody: "35000000000091",
    slugSuffix: "z2d7hp",
    status: "reserved",
  },
];

/** SAMPLE swatch colours for the colour filter. */
export const SAMPLE_COLOUR_HEX: Record<string, string> = {
  "Cosmic Orange": "#f77e2d",
  "Deep Blue": "#2f3c55",
  Silver: "#e3e4e5",
  Black: "#2b2b2d",
  White: "#f4f4f2",
  Pink: "#f2c6d4",
  Teal: "#8ccfc6",
  Ultramarine: "#7a86e8",
  Blue: "#cdd9e2",
  Green: "#d0dccb",
  Yellow: "#f2e7a8",
  Midnight: "#232a31",
  Starlight: "#f0e9de",
  "(PRODUCT)RED": "#bf0013",
  "Titanium Silverblue": "#a8b4c4",
  "Titanium Black": "#3a3b3d",
  "Titanium Gray": "#8e8d8b",
  "Titanium Whitesilver": "#e6e6e4",
  "Onyx Black": "#2a2b2e",
  "Marble Grey": "#c9c7c3",
  "Cobalt Violet": "#6c5b9b",
  "Amber Yellow": "#f0d27a",
  "Awesome Navy": "#2c3550",
  "Awesome Iceblue": "#c4d8e6",
  "Awesome Lilac": "#d6c8e6",
  "Awesome Lemon": "#efe8a5",
  Obsidian: "#25262a",
  Porcelain: "#ece6dc",
  Moonstone: "#7f8a96",
  Jade: "#b9d8c2",
  Wintergreen: "#c6dccb",
  Peony: "#f2b8c6",
  Bay: "#8fb3d9",
  Aloe: "#bfd9c1",
};

type SeedOption = {
  key: string;
  label: string;
  description?: string;
  illustration?: string;
  gradeCap?: "A" | "B" | "C" | "faulty";
  deductionBasisPoints?: number;
  deductionPence?: number;
};

/**
 * Trade-in questions and SAMPLE deductions. Inserted only if missing, so
 * changes made by staff in the database are never overwritten.
 */
export const seedQuoteQuestions: {
  key: string;
  section: "device" | "condition";
  title: string;
  help?: string;
  options: SeedOption[];
}[] = [
  {
    key: "network",
    section: "device",
    title: "Network",
    help: "Unlocked phones work on any network. If you're not sure, try another network's SIM.",
    options: [
      { key: "unlocked", label: "Unlocked" },
      { key: "locked", label: "Locked to a UK network", deductionPence: 1000 },
    ],
  },
  {
    key: "powers_on",
    section: "condition",
    title: "Does it turn on and work normally?",
    help: "Calls, Wi-Fi, cameras, buttons and speakers all work.",
    options: [
      { key: "yes", label: "Yes, everything works", illustration: "power-on" },
      {
        key: "no",
        label: "No, or something doesn’t work",
        illustration: "power-off",
        gradeCap: "faulty",
      },
    ],
  },
  {
    key: "screen",
    section: "condition",
    title: "What’s the screen like?",
    help: "Check with the screen on and off, under a bright light.",
    options: [
      {
        key: "perfect",
        label: "Like new",
        description: "No scratches at all",
        illustration: "screen-perfect",
      },
      {
        key: "light",
        label: "Light scratches",
        description: "Only visible when the screen is off",
        illustration: "screen-light",
        gradeCap: "B",
      },
      {
        key: "heavy",
        label: "Heavy scratches",
        description: "Visible with the screen on",
        illustration: "screen-heavy",
        gradeCap: "C",
      },
      {
        key: "cracked",
        label: "Cracked or faulty",
        description: "Cracks, dead pixels, lines or burn-in",
        illustration: "screen-cracked",
        gradeCap: "faulty",
      },
    ],
  },
  {
    key: "body",
    section: "condition",
    title: "What’s the back and frame like?",
    options: [
      { key: "perfect", label: "Like new", description: "No marks", illustration: "body-perfect" },
      {
        key: "light",
        label: "Light marks",
        description: "Small scuffs on the edges",
        illustration: "body-light",
        gradeCap: "B",
      },
      {
        key: "heavy",
        label: "Heavy wear",
        description: "Dents, chips or deep scratches",
        illustration: "body-heavy",
        gradeCap: "C",
      },
      {
        key: "damaged",
        label: "Cracked or bent",
        description: "Cracked back glass or a bent frame",
        illustration: "body-damaged",
        gradeCap: "faulty",
      },
    ],
  },
  {
    key: "battery",
    section: "condition",
    title: "What’s the battery health?",
    help: "iPhone: Settings › Battery › Battery Health. Android: in battery settings, or ask us in store.",
    options: [
      { key: "good", label: "85% or more", illustration: "battery-good" },
      { key: "ok", label: "80% to 84%", illustration: "battery-ok", deductionPence: 1000 },
      {
        key: "poor",
        label: "Below 80%, or “Service” shown",
        illustration: "battery-poor",
        deductionPence: 2500,
      },
    ],
  },
  {
    key: "biometrics",
    section: "condition",
    title: "Does Face ID or the fingerprint reader work?",
    options: [
      { key: "works", label: "Yes, it works", illustration: "biometrics-ok" },
      {
        key: "broken",
        label: "No, it doesn’t work",
        illustration: "biometrics-broken",
        deductionBasisPoints: 2000,
      },
    ],
  },
];
