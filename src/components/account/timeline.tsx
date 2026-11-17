import { CheckIcon, CircleIcon, XIcon } from "lucide-react";

import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type TimelineItem = {
  key: string;
  label: string;
  state: "done" | "current" | "upcoming" | "failed";
  date?: Date | null;
  detail?: string;
  /** Extra content under the current step (e.g. action buttons). */
  children?: React.ReactNode;
  /** Announce changes to the detail (it updates after the customer acts). */
  live?: boolean;
};

const STATE_TEXT = {
  done: "Done",
  current: "In progress",
  upcoming: "Not started",
  failed: "Stopped",
} as const;

/** Status timeline. State is written out (not shown by colour or icon alone). */
export function Timeline({ steps, label }: { steps: TimelineItem[]; label: string }) {
  return (
    <ol aria-label={label} className="mt-4 flex flex-col">
      {steps.map((step, index) => (
        <li
          key={step.key}
          aria-current={step.state === "current" ? "step" : undefined}
          className="relative flex gap-3 pb-5 last:pb-0"
        >
          {index < steps.length - 1 ? (
            <span
              aria-hidden
              className="absolute top-7 left-3.5 h-[calc(100%-1.75rem)] w-px bg-border"
            />
          ) : null}
          <span
            aria-hidden
            className={cn(
              "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border-2",
              step.state === "done" && "border-success bg-success text-success-foreground",
              step.state === "current" && "border-primary bg-background text-primary",
              step.state === "upcoming" && "border-border bg-background text-muted-foreground",
              step.state === "failed" &&
                "border-destructive bg-destructive text-destructive-foreground",
            )}
          >
            {step.state === "done" ? (
              <CheckIcon className="size-4" />
            ) : step.state === "failed" ? (
              <XIcon className="size-4" />
            ) : (
              <CircleIcon className={cn("size-2.5", step.state === "current" && "fill-current")} />
            )}
          </span>
          <div className="min-w-0 pt-0.5">
            <p className={cn("font-medium", step.state === "upcoming" && "text-muted-foreground")}>
              {step.label}
              <span className="sr-only">: {STATE_TEXT[step.state]}</span>
            </p>
            {step.date ? (
              <p className="text-sm text-muted-foreground">{formatDate(step.date)}</p>
            ) : null}
            {step.detail ? (
              <p className="mt-0.5 text-sm" role={step.live ? "status" : undefined}>
                {step.detail}
              </p>
            ) : null}
            {step.children ? <div className="mt-3">{step.children}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
