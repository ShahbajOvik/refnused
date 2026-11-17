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

/** Appends the Luhn check digit to a 14-digit IMEI body. */
export function withImeiCheckDigit(body14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let d = Number(body14[i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return body14 + String((10 - (sum % 10)) % 10);
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
};

/** SAMPLE refurbished stock so the shop and home page have something to show. */
export const seedProducts: SeedProduct[] = [
  {
    model: "iphone-15",
    storageGb: 128,
    colour: "Black",
    grade: "A",
    batteryHealthPercent: 96,
    pricePence: 46900,
    storeSlug: "metrotech-north-shields",
    imeiBody: "35000000000001",
  },
  {
    model: "galaxy-s24",
    storageGb: 256,
    colour: "Cobalt Violet",
    grade: "A",
    batteryHealthPercent: 93,
    pricePence: 39900,
    storeSlug: "fairtech-south-shields",
    imeiBody: "35000000000002",
  },
  {
    model: "pixel-9",
    storageGb: 128,
    colour: "Obsidian",
    grade: "B",
    batteryHealthPercent: 91,
    pricePence: 32900,
    storeSlug: "metrotech-north-shields",
    imeiBody: "35000000000003",
  },
  {
    model: "iphone-13",
    storageGb: 128,
    colour: "Midnight",
    grade: "B",
    batteryHealthPercent: 87,
    pricePence: 25900,
    storeSlug: "fairtech-south-shields",
    imeiBody: "35000000000004",
  },
  {
    model: "iphone-16",
    storageGb: 128,
    colour: "Ultramarine",
    grade: "A",
    batteryHealthPercent: 99,
    pricePence: 59900,
    storeSlug: "metrotech-north-shields",
    imeiBody: "35000000000005",
  },
  {
    model: "galaxy-a55",
    storageGb: 128,
    colour: "Awesome Navy",
    grade: "C",
    batteryHealthPercent: 88,
    pricePence: 15900,
    storeSlug: "fairtech-south-shields",
    imeiBody: "35000000000006",
  },
];
