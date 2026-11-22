"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { staffAction } from "@/auth/guards";
import { db } from "@/db";
import {
  addVariants,
  brandCreateSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  createBrand,
  createCategory,
  createModel,
  modelCreateSchema,
  modelUpdateSchema,
  setVariantActive,
  updateCategory,
  updateModel,
  variantActiveSchema,
  variantsAddSchema,
} from "@/lib/admin/catalogue";

/** The shop, trade-in pages and intake all read the catalogue. */
function refreshCatalogue() {
  revalidateTag("catalogue", "max");
  revalidateTag("products", "max");
  revalidatePath("/admin/catalogue");
  revalidatePath("/admin/intake");
}

export const createCategoryAction = staffAction(
  "catalogue.manage",
  categoryCreateSchema,
  async ({ staff, input, meta }) => {
    const category = await createCategory(db, { ...input, staffId: staff.id }, meta);
    refreshCatalogue();
    return category;
  },
);

export const updateCategoryAction = staffAction(
  "catalogue.manage",
  categoryUpdateSchema,
  async ({ staff, input, meta }) => {
    await updateCategory(db, { ...input, staffId: staff.id }, meta);
    refreshCatalogue();
  },
);

export const createBrandAction = staffAction(
  "catalogue.manage",
  brandCreateSchema,
  async ({ staff, input, meta }) => {
    const brand = await createBrand(db, { ...input, staffId: staff.id }, meta);
    refreshCatalogue();
    return brand;
  },
);

export const createModelAction = staffAction(
  "catalogue.manage",
  modelCreateSchema,
  async ({ staff, input, meta }) => {
    const model = await createModel(db, { ...input, staffId: staff.id }, meta);
    refreshCatalogue();
    return model;
  },
);

export const updateModelAction = staffAction(
  "catalogue.manage",
  modelUpdateSchema,
  async ({ staff, input, meta }) => {
    await updateModel(db, { ...input, staffId: staff.id }, meta);
    refreshCatalogue();
  },
);

export const addVariantsAction = staffAction(
  "catalogue.manage",
  variantsAddSchema,
  async ({ staff, input, meta }) => {
    const added = await addVariants(db, { ...input, staffId: staff.id }, meta);
    refreshCatalogue();
    return added;
  },
);

export const setVariantActiveAction = staffAction(
  "catalogue.manage",
  variantActiveSchema,
  async ({ staff, input, meta }) => {
    await setVariantActive(db, { ...input, staffId: staff.id }, meta);
    refreshCatalogue();
  },
);
