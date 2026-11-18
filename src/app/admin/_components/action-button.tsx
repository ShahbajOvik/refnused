"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import type { ActionResult } from "@/auth/guards";
import { Button } from "@/components/ui/button";

/**
 * Runs one admin server action with a fixed input. The action re-checks
 * the session and permission on the server.
 */
export function ActionButton<I>({
  action,
  input,
  children,
  success,
  confirm,
  variant = "default",
  size,
}: {
  action: (input: I) => Promise<ActionResult<unknown>>;
  input: I;
  children: React.ReactNode;
  success: string;
  /** Ask before running (for things that are hard to undo). */
  confirm?: string;
  variant?: "default" | "outline" | "destructive" | "secondary" | "ghost";
  size?: "sm" | "default";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={pending}
      className="min-h-11"
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        startTransition(async () => {
          const result = await action(input);
          if (result.ok) {
            toast.success(success);
            router.refresh();
          } else toast.error(result.error);
        });
      }}
    >
      {pending ? "Working…" : children}
    </Button>
  );
}

/** For forms: runs the action, shows the result, refreshes on success. */
export function useAdminAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function run<T>(
    fn: () => Promise<ActionResult<T>>,
    options: {
      success: string | ((data: T) => string);
      onSuccess?: (data: T) => void;
      onError?: (r: Extract<ActionResult<T>, { ok: false }>) => void;
    },
  ) {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        toast.success(
          typeof options.success === "function" ? options.success(result.data) : options.success,
        );
        options.onSuccess?.(result.data);
        router.refresh();
      } else {
        toast.error(result.error);
        options.onError?.(result);
      }
    });
  }
  return { pending, run };
}
