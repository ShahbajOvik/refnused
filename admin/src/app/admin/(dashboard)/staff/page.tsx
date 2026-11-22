import type { Metadata } from "next";
import { Suspense } from "react";

import { requireStaff } from "@/auth/guards";
import { ROLE_LABELS } from "@/auth/roles";
import { listStaff } from "@/auth/staff-admin";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@refnused/database/db";
import { formatDate } from "@refnused/database/lib/format";

import { CreateStaffForm, StaffRowControls } from "./staff-controls";

export const metadata: Metadata = { title: "Staff" };

export default function StaffPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <StaffList />
    </Suspense>
  );
}

async function StaffList() {
  const { staff: me } = await requireStaff("staff.manage", "/admin/staff");
  const staff = await listStaff(db);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold">Staff</h1>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="text-lg font-semibold">Add a staff member</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CreateStaffForm />
        </CardContent>
      </Card>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <caption className="sr-only">Staff accounts</caption>
          <thead className="border-b text-left text-muted-foreground">
            <tr>
              <th scope="col" className="p-3 font-medium">
                Name
              </th>
              <th scope="col" className="p-3 font-medium">
                Role
              </th>
              <th scope="col" className="p-3 font-medium">
                Last sign-in
              </th>
              <th scope="col" className="p-3 font-medium">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id} className="border-b last:border-0">
                <td className="p-3">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-muted-foreground">{s.email}</div>
                  {!s.isActive ? (
                    <Badge variant="secondary" className="mt-1">
                      Deactivated
                    </Badge>
                  ) : null}
                </td>
                <td className="p-3">{ROLE_LABELS[s.role]}</td>
                <td className="p-3 whitespace-nowrap">
                  {s.lastLoginAt ? formatDate(s.lastLoginAt, "short") : "Never"}
                </td>
                <td className="p-3">
                  <StaffRowControls
                    staffId={s.id}
                    name={s.name}
                    role={s.role}
                    isActive={s.isActive}
                    isSelf={s.id === me.id}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
