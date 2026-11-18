"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { FormMessage } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { changeOwnPasswordAction } from "./actions";

export function PasswordForm({
  hasPassword,
  minLength,
}: {
  hasPassword: boolean;
  minLength: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await changeOwnPasswordAction({
            currentPassword: String(data.get("currentPassword") ?? ""),
            newPassword: String(data.get("newPassword") ?? ""),
            confirmPassword: String(data.get("confirmPassword") ?? ""),
          });
          if (result.ok) {
            setError(undefined);
            formRef.current?.reset();
            toast.success("Password saved. Your other sessions were signed out.");
            return;
          }
          const fields = result.fieldErrors;
          setError(fields?.newPassword?.[0] ?? fields?.confirmPassword?.[0] ?? result.error);
        });
      }}
    >
      {hasPassword ? (
        <div className="grid gap-2">
          <Label htmlFor="current-password">Current password</Label>
          <Input
            id="current-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor="new-password">New password</Label>
        <Input
          id="new-password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={minLength}
          required
          aria-describedby="new-password-hint"
        />
        <p id="new-password-hint" className="text-sm text-muted-foreground">
          At least {minLength} characters. A few unrelated words work well.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirm-password">Repeat new password</Label>
        <Input
          id="confirm-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>
      {error ? <FormMessage>{error}</FormMessage> : null}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : hasPassword ? "Change password" : "Set password"}
      </Button>
    </form>
  );
}
