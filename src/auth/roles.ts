import { staffRole } from "@/db/schema/_shared";

export const STAFF_ROLES = staffRole.enumValues;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const ROLE_LABELS: Record<StaffRole, string> = {
  owner: "Owner",
  manager: "Manager",
  staff: "Staff",
  content_editor: "Content editor",
};

export const PERMISSIONS = [
  "admin.access",
  "quotes.manage",
  "inspections.manage",
  "products.manage",
  "orders.manage",
  "prices.update",
  "payouts.approve",
  "refunds.issue",
  "reviews.moderate",
  "content.edit",
  "stores.manage",
  "audit.view",
  "staff.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const OPERATIONS: Permission[] = [
  "quotes.manage",
  "inspections.manage",
  "products.manage",
  "orders.manage",
];

/** What each role may do. The single source of truth for authorisation. */
export const ROLE_PERMISSIONS: Record<StaffRole, ReadonlySet<Permission>> = {
  owner: new Set(PERMISSIONS),
  manager: new Set<Permission>([
    "admin.access",
    ...OPERATIONS,
    "prices.update",
    "payouts.approve",
    "refunds.issue",
    "reviews.moderate",
    "content.edit",
    "stores.manage",
    "audit.view",
  ]),
  staff: new Set<Permission>(["admin.access", ...OPERATIONS]),
  content_editor: new Set<Permission>(["admin.access", "content.edit", "reviews.moderate"]),
};

export function can(role: StaffRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

/**
 * Permission needed for each admin section. The longest matching prefix
 * wins; anything else under /admin needs `admin.access`.
 * Pages and actions must still check their own permission server-side.
 */
const ADMIN_ROUTE_PERMISSIONS: [prefix: string, permission: Permission][] = [
  ["/admin/staff", "staff.manage"],
  ["/admin/prices", "prices.update"],
  ["/admin/payouts", "payouts.approve"],
  ["/admin/refunds", "refunds.issue"],
  ["/admin/content", "content.edit"],
  ["/admin/reviews", "reviews.moderate"],
  ["/admin/stores", "stores.manage"],
  ["/admin/audit", "audit.view"],
  ["/admin/quotes", "quotes.manage"],
  ["/admin/inspections", "inspections.manage"],
  ["/admin/products", "products.manage"],
  ["/admin/orders", "orders.manage"],
];

export function permissionForAdminPath(pathname: string): Permission {
  let match: [string, Permission] | undefined;
  for (const rule of ADMIN_ROUTE_PERMISSIONS) {
    const [prefix] = rule;
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      if (!match || prefix.length > match[0].length) match = rule;
    }
  }
  return match?.[1] ?? "admin.access";
}
