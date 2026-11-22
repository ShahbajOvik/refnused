"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";

import type { ActionResult } from "@/auth/guards";
import { ROLE_LABELS, STAFF_ROLES, type StaffRole } from "@/auth/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  changeStaffRoleAction,
  createStaffAction,
  resetStaffTwoFactorAction,
  setStaffActiveAction,
} from "./actions";

function useAction() {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<ActionResult>, success: string) =>
    startTransition(async () => {
      const result = await fn();
      if (result.ok) toast.success(success);
      else toast.error(result.error);
    });
  return { pending, run };
}

export function CreateStaffForm() {
  const { pending, run } = useAction();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      className="grid gap-4 sm:grid-cols-[1fr_1fr_12rem_auto] sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        run(async () => {
          const result = await createStaffAction({
            name: String(data.get("name") ?? ""),
            email: String(data.get("email") ?? ""),
            role: data.get("role") as StaffRole,
          });
          if (result.ok) formRef.current?.reset();
          return result;
        }, "Staff member added. They can now sign in and set up two-step verification.");
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="new-staff-name">Name</Label>
        <Input id="new-staff-name" name="name" required autoComplete="off" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="new-staff-email">Work email</Label>
        <Input id="new-staff-email" name="email" type="email" required autoComplete="off" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="new-staff-role">Role</Label>
        <Select name="role" defaultValue="staff">
          <SelectTrigger id="new-staff-role" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STAFF_ROLES.map((role) => (
              <SelectItem key={role} value={role}>
                {ROLE_LABELS[role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={pending}>
        Add staff
      </Button>
    </form>
  );
}

export function StaffRowControls({
  staffId,
  name,
  role,
  isActive,
  isSelf,
}: {
  staffId: string;
  name: string;
  role: StaffRole;
  isActive: boolean;
  isSelf: boolean;
}) {
  const { pending, run } = useAction();
  if (isSelf) return <span className="text-sm text-muted-foreground">You</span>;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={role}
        disabled={pending}
        onValueChange={(value) =>
          run(
            () => changeStaffRoleAction({ staffId, role: value as StaffRole }),
            `${name} is now ${ROLE_LABELS[value as StaffRole]}. They’ll need to sign in again.`,
          )
        }
      >
        <SelectTrigger size="sm" aria-label={`Role for ${name}`} className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STAFF_ROLES.map((r) => (
            <SelectItem key={r} value={r}>
              {ROLE_LABELS[r]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          run(
            () => resetStaffTwoFactorAction({ staffId }),
            `Two-step verification reset for ${name}.`,
          )
        }
      >
        Reset 2FA
      </Button>
      <Button
        variant={isActive ? "destructive" : "secondary"}
        size="sm"
        disabled={pending}
        onClick={() =>
          run(
            () => setStaffActiveAction({ staffId, active: !isActive }),
            isActive ? `${name} deactivated and signed out.` : `${name} reactivated.`,
          )
        }
      >
        {isActive ? "Deactivate" : "Reactivate"}
      </Button>
    </div>
  );
}
