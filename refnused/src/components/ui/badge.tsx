import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { GRADE_INFO, type Grade } from "@/lib/grades";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        outline: "border-border text-foreground",
        success: "bg-success text-success-foreground",
        warning: "bg-warning text-warning-foreground",
        destructive: "bg-destructive text-destructive-foreground",
        "grade-a": "border-grade-a-foreground/20 bg-grade-a text-grade-a-foreground",
        "grade-b": "border-grade-b-foreground/20 bg-grade-b text-grade-b-foreground",
        "grade-c": "border-grade-c-foreground/20 bg-grade-c text-grade-c-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

const GRADE_VARIANT = {
  A: "grade-a",
  B: "grade-b",
  C: "grade-c",
} as const satisfies Record<Grade, VariantProps<typeof badgeVariants>["variant"]>;

type GradeBadgeProps = Omit<React.ComponentProps<"span">, "children"> & {
  grade: Grade;
  /** Show the label ("Excellent") next to the grade letter. Defaults to true. */
  showLabel?: boolean;
};

/**
 * Condition grade badge. The grade is always written out as text, so it
 * never relies on colour alone (WCAG 1.4.1).
 */
function GradeBadge({ grade, showLabel = true, className, ...props }: GradeBadgeProps) {
  const info = GRADE_INFO[grade];

  return (
    <Badge
      variant={GRADE_VARIANT[grade]}
      data-grade={grade}
      title={info.description}
      className={cn("font-semibold", className)}
      {...props}
    >
      {`Grade ${grade}`}
      {showLabel ? " " : null}
      {showLabel ? <span className="font-medium">{`· ${info.label}`}</span> : null}
    </Badge>
  );
}

export { Badge, badgeVariants, GradeBadge };
