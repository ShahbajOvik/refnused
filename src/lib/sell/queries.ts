import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { db } from "@/db";

import {
  getBrand,
  getSellModel,
  listBrandModels,
  listDropOffStores,
  listSellBrands,
  listSellModelParams,
} from "./catalogue";
import { loadQuestionConfig, publicQuestions } from "./offer-service";

/*
 * Cached catalogue reads for the statically generated sell pages.
 * Revalidate with revalidateTag("catalogue") when models, prices or
 * questions change in the admin.
 */

export async function cachedSellBrands() {
  "use cache";
  cacheLife("hours");
  cacheTag("catalogue");
  return listSellBrands(db);
}

export async function cachedBrand(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("catalogue");
  return getBrand(db, slug);
}

export async function cachedBrandModels(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("catalogue", "trade-in-prices");
  return listBrandModels(db, slug);
}

export async function cachedSellModel(brand: string, model: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("catalogue", "trade-in-prices");
  return getSellModel(db, brand, model);
}

export async function cachedModelParams() {
  "use cache";
  cacheLife("hours");
  cacheTag("catalogue");
  return listSellModelParams(db);
}

/** Questions and labels only: no deductions leave the server. */
export async function cachedPublicQuestions() {
  "use cache";
  cacheLife("hours");
  cacheTag("quote-questions");
  return publicQuestions(await loadQuestionConfig(db));
}

export async function cachedDropOffStores() {
  "use cache";
  cacheLife("hours");
  cacheTag("stores");
  return listDropOffStores(db);
}
