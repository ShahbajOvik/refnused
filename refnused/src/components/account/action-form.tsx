"use client";

import {
  createContext,
  startTransition,
  useActionState,
  useContext,
  useEffect,
  useRef,
} from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { announce } from "./announcer";

export type AccountActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * A form that posts to a server action and shows its result. Works
 * without JavaScript (the page reloads); with it, results appear in place
 * and are announced.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  label,
}: {
  action: (formData: FormData) => Promise<AccountActionResult>;
  children: React.ReactNode | ((state: AccountActionResult | null) => React.ReactNode);
  className?: string;
  resetOnSuccess?: boolean;
  /** Accessible name for the form. */
  label?: string;
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: AccountActionResult | null, formData: FormData) => {
      const result = await action(formData);
      // Announced from the layout, which survives the refresh.
      if (result.ok) announce(result.message);
      return result;
    },
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!state) return;
    if (state.ok && resetOnSuccess) formRef.current?.reset();
    if (!state.ok) statusRef.current?.focus();
  }, [state, resetOnSuccess]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className={className}
      aria-label={label}
      noValidate
      onSubmit={(event) => {
        // With JavaScript, submit ourselves: React resets a form after a
        // form action, which would wipe what the customer typed on errors.
        event.preventDefault();
        const data = new FormData(event.currentTarget, event.nativeEvent.submitter);
        startTransition(() => formAction(data));
      }}
    >
      <PendingContext value={pending}>
        {typeof children === "function" ? children(state) : children}
      </PendingContext>
      <div ref={statusRef} tabIndex={-1} className="focus:outline-none">
        {state && !state.ok ? (
          <p role="alert" className="mt-3 text-sm font-medium text-destructive">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}

/** Whether the enclosing ActionForm is submitting (its own submit path isn't a form action). */
const PendingContext = createContext<boolean | null>(null);

export function SubmitButton({
  children,
  pendingText = "Saving…",
  variant,
  className,
  name,
  value,
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: "default" | "outline" | "destructive" | "secondary" | "ghost";
  className?: string;
  name?: string;
  value?: string;
}) {
  const formStatus = useFormStatus();
  const pending = useContext(PendingContext) ?? formStatus.pending;
  return (
    <Button
      type="submit"
      variant={variant}
      disabled={pending}
      name={name}
      value={value}
      className={cn("min-h-11", className)}
    >
      {pending ? pendingText : children}
    </Button>
  );
}

/** Field error from an action result, for aria-describedby. */
export function fieldError(state: AccountActionResult | null, name: string) {
  return state && !state.ok ? state.fieldErrors?.[name]?.[0] : undefined;
}
