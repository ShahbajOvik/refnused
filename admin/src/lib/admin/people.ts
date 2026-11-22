import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";

import {
  auditLog,
  customers,
  orders,
  quotes,
  staffUsers,
  stores,
} from "@refnused/database/db/schema";
import type { DayOfWeek, OpeningHours } from "@refnused/database/db/schema/stores";
import type { AppDb } from "@refnused/database/db/types";
import { ActionError } from "@refnused/database/lib/action-error";
import { recordAudit, type RequestMeta } from "@refnused/database/lib/audit";
import { DAYS } from "@refnused/database/lib/stores";
import { ukPhoneSchema, ukPostcodeSchema } from "@refnused/database/lib/validation/uk";

// Customers ------------------------------------------------------------------------

export type CustomerSearchRow = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  createdAt: Date;
  deletedAt: Date | null;
  quotes: number;
  orders: number;
};

/** By email, name, phone, quote reference or order number. */
export async function searchCustomers(db: AppDb, query: string): Promise<CustomerSearchRow[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const digits = q.replace(/\D/g, "");
  const phoneLike = digits.length >= 6 ? `%${digits.slice(-9)}%` : null;
  return db
    .select({
      id: customers.id,
      email: customers.email,
      name: customers.name,
      phone: customers.phone,
      createdAt: customers.createdAt,
      deletedAt: customers.deletedAt,
      quotes: sql<number>`(select count(*) from ${quotes} where ${quotes.customerId} = ${customers.id})::int`,
      orders: sql<number>`(select count(*) from ${orders} where ${orders.customerId} = ${customers.id})::int`,
    })
    .from(customers)
    .where(
      or(
        ilike(customers.email, `%${q}%`),
        ilike(customers.name, `%${q}%`),
        phoneLike ? ilike(customers.phone, phoneLike) : undefined,
        sql`exists (select 1 from ${quotes} where ${quotes.customerId} = ${customers.id} and ${quotes.reference} ilike ${q})`,
        sql`exists (select 1 from ${orders} where ${orders.customerId} = ${customers.id} and ${orders.orderNumber} ilike ${q})`,
      ),
    )
    .orderBy(desc(customers.createdAt))
    .limit(50);
}

export async function getCustomerAdmin(db: AppDb, id: string) {
  const [customer] = await db
    .select({
      id: customers.id,
      email: customers.email,
      name: customers.name,
      phone: customers.phone,
      marketingEmail: customers.marketingOptIn,
      marketingSms: customers.marketingSmsOptIn,
      createdAt: customers.createdAt,
      deletedAt: customers.deletedAt,
    })
    .from(customers)
    .where(eq(customers.id, id));
  return customer ?? null;
}

// Stores --------------------------------------------------------------------------

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour time, like 09:00");

const daySchema = z
  .object({ closed: z.boolean(), opens: time.optional(), closes: time.optional() })
  .superRefine((d, ctx) => {
    if (d.closed) return;
    if (!d.opens || !d.closes) {
      ctx.addIssue({
        code: "custom",
        message: "Enter opening and closing times, or mark it closed",
      });
    } else if (d.closes <= d.opens) {
      ctx.addIssue({ code: "custom", message: "Closing time must be after opening time" });
    }
  });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters`)
    .transform((v) => v || null);

export const storeUpdateSchema = z.object({
  storeId: z.uuid(),
  name: z.string().trim().min(2).max(60),
  street: z.string().trim().min(2).max(100),
  town: z.string().trim().min(2).max(60),
  postcode: ukPostcodeSchema,
  phone: ukPhoneSchema,
  email: z.union([z.literal(""), z.email().max(254)]).transform((v) => v || null),
  latitude: z
    .union([z.literal(""), z.coerce.number().min(49).max(61)])
    .transform((v) => (v === "" ? null : v)),
  longitude: z
    .union([z.literal(""), z.coerce.number().min(-9).max(2)])
    .transform((v) => (v === "" ? null : v)),
  isActive: z.boolean(),
  parkingInfo: optionalText(300),
  nearestMetro: optionalText(300),
  photos: z
    .array(
      z.object({
        key: z.string().regex(/^stores\/[\w/.-]+$/),
        alt: z.string().trim().min(1, "Describe each photo").max(200),
      }),
    )
    .max(8, "Up to 8 photos")
    .default([]),
  hours: z.object(
    Object.fromEntries(DAYS.map((d) => [d.key, daySchema])) as Record<DayOfWeek, typeof daySchema>,
  ),
});

export async function updateStore(
  db: AppDb,
  input: z.output<typeof storeUpdateSchema> & { staffId: string },
  meta?: RequestMeta,
) {
  const openingHours = Object.fromEntries(
    DAYS.map((d) => {
      const h = input.hours[d.key];
      return [d.key, h.closed ? null : { opens: h.opens!, closes: h.closes! }];
    }),
  ) as OpeningHours;
  await db.transaction(async (transaction) => {
    const tx = transaction as unknown as AppDb;
    const [before] = await tx
      .select()
      .from(stores)
      .where(eq(stores.id, input.storeId))
      .for("update");
    if (!before) throw new ActionError("That store doesn’t exist.");
    const after = {
      name: input.name,
      street: input.street,
      town: input.town,
      postcode: input.postcode,
      phone: input.phone,
      email: input.email,
      latitude: input.latitude,
      longitude: input.longitude,
      isActive: input.isActive,
      parkingInfo: input.parkingInfo,
      nearestMetro: input.nearestMetro,
      photos: input.photos,
      openingHours,
    };
    await tx.update(stores).set(after).where(eq(stores.id, input.storeId));
    const changed = Object.entries(after).filter(
      ([k, v]) => JSON.stringify((before as Record<string, unknown>)[k]) !== JSON.stringify(v),
    );
    if (changed.length) {
      await recordAudit(
        tx,
        {
          actorType: "staff",
          actorId: input.staffId,
          action: "store.updated",
          entityType: "store",
          entityId: input.storeId,
          changes: {
            before: Object.fromEntries(
              changed.map(([k]) => [k, (before as Record<string, unknown>)[k]]),
            ),
            after: Object.fromEntries(changed),
          },
        },
        meta,
      );
    }
  });
}

// Audit log ---------------------------------------------------------------------------

export type AuditRow = {
  id: number;
  at: Date;
  actorType: string;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string;
  changes: unknown;
  ipAddress: string | null;
};

export async function listAudit(
  db: AppDb,
  options: { entityType?: string; entityId?: string; action?: string; limit?: number } = {},
): Promise<AuditRow[]> {
  return db
    .select({
      id: auditLog.id,
      at: auditLog.createdAt,
      actorType: auditLog.actorType,
      actorName: sql<
        string | null
      >`coalesce(${staffUsers.name}, ${customers.name}, ${customers.email})`,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      changes: auditLog.changes,
      ipAddress: auditLog.ipAddress,
    })
    .from(auditLog)
    .leftJoin(staffUsers, and(eq(auditLog.actorType, "staff"), eq(auditLog.actorId, staffUsers.id)))
    .leftJoin(
      customers,
      and(eq(auditLog.actorType, "customer"), eq(auditLog.actorId, customers.id)),
    )
    .where(
      and(
        options.entityType ? eq(auditLog.entityType, options.entityType) : undefined,
        options.entityId ? eq(auditLog.entityId, options.entityId) : undefined,
        options.action ? ilike(auditLog.action, `${options.action}%`) : undefined,
      ),
    )
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(options.limit ?? 200);
}
