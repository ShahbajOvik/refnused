import { describe, expect, it } from "vitest";

import {
  can,
  PERMISSIONS,
  permissionForAdminPath,
  STAFF_ROLES,
  type Permission,
} from "@/auth/roles";

describe("role permissions", () => {
  it("defines exactly the four roles", () => {
    expect(STAFF_ROLES).toEqual(["owner", "manager", "staff", "content_editor"]);
  });

  it("gives owners every permission", () => {
    for (const p of PERMISSIONS) expect(can("owner", p)).toBe(true);
  });

  it("lets every role into /admin", () => {
    for (const role of STAFF_ROLES) expect(can(role, "admin.access")).toBe(true);
  });

  // [permission, owner, manager, staff, content_editor]
  const matrix: [Permission, boolean, boolean, boolean, boolean][] = [
    ["staff.manage", true, false, false, false],
    ["prices.update", true, true, false, false],
    ["payouts.approve", true, true, false, false],
    ["refunds.issue", true, true, false, false],
    ["audit.view", true, true, false, false],
    ["quotes.manage", true, true, true, false],
    ["inspections.manage", true, true, true, false],
    ["orders.manage", true, true, true, false],
    ["catalogue.manage", true, true, false, false],
    ["content.edit", true, true, false, true],
    ["reviews.moderate", true, true, false, true],
  ];

  it.each(matrix)("%s", (permission, owner, manager, staff, editor) => {
    expect({
      owner: can("owner", permission),
      manager: can("manager", permission),
      staff: can("staff", permission),
      content_editor: can("content_editor", permission),
    }).toEqual({ owner, manager, staff, content_editor: editor });
  });
});

describe("permissionForAdminPath", () => {
  it.each([
    ["/admin", "admin.access"],
    ["/admin/security", "admin.access"],
    ["/admin/staff", "staff.manage"],
    ["/admin/catalogue", "catalogue.manage"],
    ["/admin/staff/123", "staff.manage"],
    ["/admin/prices", "prices.update"],
    ["/admin/content/home", "content.edit"],
    ["/admin/orders/RU-1", "orders.manage"],
    // Prefix must match a whole segment.
    ["/admin/staffroom", "admin.access"],
  ])("%s needs %s", (path, permission) => {
    expect(permissionForAdminPath(path)).toBe(permission);
  });
});
