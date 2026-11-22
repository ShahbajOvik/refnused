// @vitest-environment node
import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createStaff } from "@/auth/staff-admin";
import {
  auditLog,
  categories,
  modelVariants,
  products,
  stores,
} from "@refnused/database/db/schema";
import { seed } from "@refnused/database/db/seed";
import type { AppDb } from "@refnused/database/db/types";
import { getPriceTable, listModelsForPrices } from "@/lib/admin/prices";
import {
  getBrand,
  getSellModel,
  listBrandModels,
  listSellBrands,
} from "@refnused/database/lib/sell/catalogue";
import {
  getShopFacets,
  listTradeInModels,
  searchProducts,
  listShopCategories,
} from "@refnused/database/lib/shop/catalogue";
import {
  EMPTY_FILTERS,
  parseShopFilters,
  serializeShopFilters,
} from "@refnused/database/lib/shop/filters";
import { productSlug } from "@refnused/database/lib/shop/slug";
import { itemNoun, listingNoun, variantLabel } from "@refnused/database/lib/shop/variant-label";
import { createTestDb } from "@refnused/database/test/db";

import {
  addVariants,
  buildVariantOptions,
  categoryCreateSchema,
  createBrand,
  createCategory,
  createModel,
  loadCatalogue,
  modelCreateSchema,
  parseStorage,
  setVariantActive,
  splitOptions,
  updateCategory,
  updateModel,
} from "./catalogue";
import { createProductFromIntake, intakeSchema, updateProductAdmin } from "./intake";

vi.setConfig({ testTimeout: 60_000 });

let db: AppDb;
let close: () => Promise<void>;
let staffId: string;
let storeId: string;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seed(db);
  ({ id: staffId } = await createStaff(
    db,
    { email: "catalogue@example.co.uk", name: "Cat Owner", role: "owner" },
    { type: "system" },
  ));
  [{ id: storeId }] = (await db.select({ id: stores.id }).from(stores).limit(1)) as [
    { id: string },
  ];
});
afterAll(() => close?.());

const unique = (name: string) => `${name} ${randomBytes(3).toString("hex")}`;
const photo = { key: "products/test/one.webp", alt: "Front of the item" };

async function category(input: Partial<Parameters<typeof categoryCreateSchema.parse>[0]> = {}) {
  return createCategory(db, {
    ...categoryCreateSchema.parse({
      name: unique("Category"),
      identifierType: "serial",
      hasStorage: true,
      hasBattery: true,
      requiresDataWipe: true,
      ...input,
    }),
    staffId,
  });
}

async function model(
  categoryId: string,
  options: { storage?: string; colours?: string; configurations?: string } = {},
) {
  const brand = await createBrand(db, { name: unique("Brand"), staffId });
  const created = await createModel(db, {
    ...modelCreateSchema.parse({
      categoryId,
      brandId: brand.id,
      name: unique("Model"),
      releaseYear: 2024,
      storage: "256GB",
      colours: "Black",
      ...options,
    }),
    staffId,
  });
  const variants = await db
    .select()
    .from(modelVariants)
    .where(eq(modelVariants.modelId, created.id));
  return { ...created, brand, variants };
}

const intake = (input: Record<string, unknown>) =>
  createProductFromIntake(db, {
    ...intakeSchema.parse({
      grade: "A",
      pricePounds: 299,
      storeId,
      photos: [photo],
      ...input,
    }),
    staffId,
  });

const serial = () => `SN-${randomBytes(5).toString("hex").toUpperCase()}`;

describe("option parsing", () => {
  it("reads storage sizes in GB and TB, sorted and without repeats", () => {
    expect(parseStorage("1TB, 256, 512gb, 256GB")).toEqual([256, 512, 1024]);
  });

  it.each(["big", "0GB", "-1", "1.5GB"])("rejects the storage size %s", (value) => {
    expect(() => parseStorage(value)).toThrow("isn’t a storage size");
  });

  it("splits on commas and new lines, ignoring case repeats and blanks", () => {
    expect(splitOptions("Black, black,\n Space  Grey ,,")).toEqual(["Black", "Space Grey"]);
  });

  it("builds every combination of the options", () => {
    const options = buildVariantOptions(
      { hasStorage: true },
      { storage: "256, 512", configurations: "8GB RAM\n16GB RAM", colours: "Black, Silver" },
    );
    expect(options).toHaveLength(8);
    expect(options[0]).toEqual({ storageGb: 256, configuration: "8GB RAM", colour: "Black" });
  });

  it("leaves storage out for items without it", () => {
    expect(
      buildVariantOptions(
        { hasStorage: false },
        { storage: "256", configurations: "", colours: "White" },
      ),
    ).toEqual([{ storageGb: null, configuration: "", colour: "White" }]);
  });

  it("needs a colour, storage where it applies, and a sensible number of options", () => {
    const base = { storage: "256", configurations: "", colours: "Black" };
    expect(() => buildVariantOptions({ hasStorage: true }, { ...base, colours: "" })).toThrow(
      "colour",
    );
    expect(() => buildVariantOptions({ hasStorage: true }, { ...base, storage: "" })).toThrow(
      "storage",
    );
    const many = Array.from({ length: 15 }, (_, i) => `Option ${i}`).join(",");
    expect(() =>
      buildVariantOptions(
        { hasStorage: true },
        { storage: "1,2,3", configurations: many, colours: many },
      ),
    ).toThrow("combinations");
  });

  it("describes variants without showing missing options", () => {
    expect(variantLabel({ storageGb: 128, colour: "Black" })).toBe("128GB, Black");
    expect(variantLabel({ storageGb: null, configuration: "65W", colour: "White" })).toBe(
      "65W, White",
    );
    expect(itemNoun("laptops").many).toBe("laptops");
    expect(listingNoun([], ["phones"]).many).toBe("phones");
    expect(listingNoun([], ["phones", "laptops"]).many).toBe("items");
  });
});

describe("categories", () => {
  it("puts existing models in Phones and audits new categories", async () => {
    const { categories: rows, models } = await loadCatalogue(db);
    const phones = rows.find((c) => c.slug === "phones")!;
    expect(phones.identifierType).toBe("imei");
    expect(models.filter((m) => m.categoryId === phones.id).length).toBeGreaterThanOrEqual(10);

    const created = await category({ name: unique("Tablets") });
    const entries = await db.select().from(auditLog).where(eq(auditLog.entityId, created.id));
    expect(entries.map((e) => e.action)).toContain("catalogue.category_created");
  });

  it("rejects duplicate names, however they are typed", async () => {
    const name = unique("Watches");
    await category({ name });
    await expect(category({ name: name.toUpperCase() })).rejects.toThrow("already exists");
  });

  it("requires storage for IMEI categories", () => {
    const result = categoryCreateSchema.safeParse({
      name: "Pagers",
      identifierType: "imei",
      hasStorage: false,
      hasBattery: true,
      requiresDataWipe: true,
    });
    expect(result.success).toBe(false);
  });

  it("locks a category's item rules once it has stock", async () => {
    const c = await category();
    const m = await model(c.id);
    await intake({
      variantId: m.variants[0]!.id,
      serialNumber: serial(),
      batteryHealthPercent: 90,
    });
    const [row] = await db.select().from(categories).where(eq(categories.id, c.id));
    await expect(
      updateCategory(db, {
        ...row!,
        categoryId: c.id,
        hasBattery: false,
        staffId,
      }),
    ).rejects.toThrow("can’t change");
  });
});

describe("models", () => {
  it("won't let a brand take the slug used by category pages", async () => {
    await expect(createBrand(db, { name: "Category", staffId })).rejects.toThrow("can’t be used");
  });

  it("gives two brands' same-named models different URLs", async () => {
    const c = await category();
    const name = unique("Book");
    const [one, two] = [
      await createBrand(db, { name: unique("Alpha"), staffId }),
      await createBrand(db, { name: unique("Beta"), staffId }),
    ];
    const base = { categoryId: c.id, name, releaseYear: 2024, storage: "256", colours: "Black" };
    const first = await createModel(db, {
      ...modelCreateSchema.parse({ ...base, brandId: one.id }),
      staffId,
    });
    const second = await createModel(db, {
      ...modelCreateSchema.parse({ ...base, brandId: two.id }),
      staffId,
    });
    expect(first.slug).not.toBe(second.slug);
  });

  it("treats items without storage as duplicates of each other", async () => {
    const c = await category({ hasStorage: false, identifierType: "none" });
    const m = await model(c.id, { storage: "", colours: "White" });
    await addVariants(db, {
      modelId: m.id,
      storage: "",
      colours: "White, Black",
      configurations: "",
      staffId,
    });
    const rows = await db.select().from(modelVariants).where(eq(modelVariants.modelId, m.id));
    expect(rows.map((r) => r.colour).sort()).toEqual(["Black", "White"]);
  });

  it("brings a hidden option back when it is added again", async () => {
    const c = await category();
    const m = await model(c.id);
    await setVariantActive(db, { variantId: m.variants[0]!.id, isActive: false, staffId });
    await addVariants(db, {
      modelId: m.id,
      storage: "256",
      colours: "Black",
      configurations: "",
      staffId,
    });
    const [row] = await db
      .select()
      .from(modelVariants)
      .where(eq(modelVariants.id, m.variants[0]!.id));
    expect(row!.isActive).toBe(true);
  });

  it("won't hide anything that has listed stock", async () => {
    const c = await category();
    const m = await model(c.id);
    const variantId = m.variants[0]!.id;
    const unit = await intake({
      variantId,
      serialNumber: serial(),
      batteryHealthPercent: 90,
      certificateKey: "certificates/test.pdf",
      publish: true,
    });

    await expect(setVariantActive(db, { variantId, isActive: false, staffId })).rejects.toThrow(
      "Withdraw",
    );
    await expect(
      updateModel(db, { modelId: m.id, name: "x", releaseYear: 2024, isActive: false, staffId }),
    ).rejects.toThrow("Withdraw");
    const [row] = await db.select().from(categories).where(eq(categories.id, c.id));
    await expect(
      updateCategory(db, { ...row!, categoryId: c.id, isActive: false, staffId }),
    ).rejects.toThrow("Withdraw");

    await updateProductAdmin(db, { productId: unit.id, status: "withdrawn", staffId });
    await setVariantActive(db, { variantId, isActive: false, staffId });
  });
});

describe("device intake by category", () => {
  it("adds a laptop by serial number, normalising it", async () => {
    const c = await category();
    const m = await model(c.id);
    const sn = serial();
    const unit = await intake({
      variantId: m.variants[0]!.id,
      serialNumber: `  ${sn.toLowerCase()} `,
      batteryHealthPercent: 91,
      certificateKey: "certificates/laptop.pdf",
      publish: true,
    });
    const [row] = await db.select().from(products).where(eq(products.id, unit.id));
    expect(row).toMatchObject({ imei: null, serialNumber: sn, status: "listed" });
  });

  it("refuses a repeated serial number and a missing one", async () => {
    const c = await category();
    const m = await model(c.id);
    const variantId = m.variants[0]!.id;
    const serialNumber = serial();
    await intake({ variantId, serialNumber, batteryHealthPercent: 90 });
    await expect(intake({ variantId, serialNumber, batteryHealthPercent: 90 })).rejects.toThrow(
      "already exists",
    );
    await expect(intake({ variantId, batteryHealthPercent: 90 })).rejects.toThrow("serial number");
  });

  it("still needs an IMEI for phones, whatever the form sends", async () => {
    const { models, categories: rows } = await loadCatalogue(db);
    const phones = rows.find((c) => c.slug === "phones")!;
    const phone = models.find((m) => m.categoryId === phones.id)!;
    await expect(
      intake({
        variantId: phone.variants[0]!.id,
        serialNumber: serial(),
        batteryHealthPercent: 90,
      }),
    ).rejects.toThrow("IMEI");
  });

  it("requires the certificate and battery only where the category needs them", async () => {
    const laptop = await category();
    const laptopModel = await model(laptop.id);
    await expect(
      intake({
        variantId: laptopModel.variants[0]!.id,
        serialNumber: serial(),
        batteryHealthPercent: 90,
        publish: true,
      }),
    ).rejects.toThrow("data-wipe certificate");
    await expect(
      intake({ variantId: laptopModel.variants[0]!.id, serialNumber: serial() }),
    ).rejects.toThrow("battery");

    const accessory = await category({
      identifierType: "none",
      hasStorage: false,
      hasBattery: false,
      requiresDataWipe: false,
    });
    const charger = await model(accessory.id, { storage: "", colours: "White" });
    const unit = await intake({
      variantId: charger.variants[0]!.id,
      batteryHealthPercent: 50,
      certificateKey: "certificates/ignored.pdf",
      publish: true,
    });
    const [row] = await db.select().from(products).where(eq(products.id, unit.id));
    expect(row).toMatchObject({
      imei: null,
      batteryHealthPercent: null,
      dataWipeRequired: false,
      dataWipeCertificateKey: null,
      status: "listed",
    });
    expect(row!.serialNumber).toMatch(/^SKU-[0-9A-F]{12}$/);
    expect(unit.slug).not.toContain("null");
  });

  it("needs a photo before publishing in every category", async () => {
    const accessory = await category({
      identifierType: "none",
      hasStorage: false,
      hasBattery: false,
      requiresDataWipe: false,
    });
    const item = await model(accessory.id, { storage: "", colours: "Blue" });
    await expect(
      intake({ variantId: item.variants[0]!.id, photos: [], publish: true }),
    ).rejects.toThrow("photo");
  });
});

describe("shop and trade-ins", () => {
  it("filters the shop by category and keeps items without storage out of the storage filter", async () => {
    const accessory = await category({
      name: unique("Chargers"),
      identifierType: "none",
      hasStorage: false,
      hasBattery: false,
      requiresDataWipe: false,
    });
    const item = await model(accessory.id, { storage: "", colours: "Green" });
    await intake({ variantId: item.variants[0]!.id, publish: true });
    const [row] = await db.select().from(categories).where(eq(categories.id, accessory.id));

    const filters = { ...EMPTY_FILTERS, categories: [row!.slug] };
    const result = await searchProducts(db, filters);
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({ storageGb: null, batteryHealthPercent: null });

    const facets = await getShopFacets(db, EMPTY_FILTERS);
    expect(facets.categories.map((c) => c.value)).toContain(row!.slug);
    expect(facets.storage.every((s) => s.value !== "null")).toBe(true);
    expect((await listShopCategories(db)).map((c) => c.slug)).toContain(row!.slug);
  });

  it("sorts items without a battery last", async () => {
    const result = await searchProducts(db, { ...EMPTY_FILTERS, sort: "battery-desc" }, 200);
    const values = result.items.map((p) => p.batteryHealthPercent);
    const firstNull = values.indexOf(null);
    expect(firstNull).toBeGreaterThan(0);
    expect(values.slice(firstNull).every((v) => v === null)).toBe(true);
  });

  it("keeps category filters in the URL", () => {
    const filters = parseShopFilters(new URLSearchParams("category=laptops&brand=dell"));
    expect(filters.categories).toEqual(["laptops"]);
    expect(serializeShopFilters(filters)).toBe("category=laptops&brand=dell");
  });

  it("never offers trade-ins for non-IMEI categories", async () => {
    const c = await category();
    const m = await model(c.id);
    const slug = m.slug;

    expect((await listSellBrands(db)).map((b) => b.slug)).not.toContain(m.brand.slug);
    expect(await getBrand(db, m.brand.slug)).toBeNull();
    expect(await listBrandModels(db, m.brand.slug)).toEqual([]);
    expect(await getSellModel(db, m.brand.slug, slug)).toBeNull();
    expect((await listTradeInModels(db)).map((t) => t.slug)).not.toContain(slug);
    expect((await listModelsForPrices(db)).map((t) => t.slug)).not.toContain(slug);
    expect(await getPriceTable(db, slug)).toEqual([]);
  });

  it("hides a new phone from the sell pages until it has trade-in prices", async () => {
    const [phones] = await db.select().from(categories).where(eq(categories.slug, "phones"));
    const m = await model(phones!.id);
    expect(await listBrandModels(db, m.brand.slug)).toEqual([]);
    expect((await getPriceTable(db, m.slug)).length).toBe(1);
  });

  it("keeps phone URLs in their existing format", () => {
    expect(
      productSlug({ modelSlug: "iphone-15", storageGb: 128, colour: "Black", suffix: "abc123" }),
    ).toBe("iphone-15-128gb-black-abc123");
    expect(
      productSlug({ modelSlug: "usb-c", storageGb: null, colour: "White", suffix: "abc123" }),
    ).toBe("usb-c-white-abc123");
  });
});
