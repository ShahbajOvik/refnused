import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-transparent bg-clip-padding font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] outline-none select-none",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50",
    "aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/30",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        /** Brand accent. Use for the main action on a page or section. */
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        /** Neutral filled. Secondary actions. */
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/70",
        /** Neutral bordered. Tertiary actions, filters. */
        outline:
          "border-input bg-background hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent",
        /** Icon buttons and low-emphasis actions. */
        ghost: "hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent",
        /** Irreversible actions (remove, cancel order). */
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive",
        link: "h-auto px-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        default: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base [&_svg:not([class*='size-'])]:size-5",
        icon: "size-10",
        "icon-sm": "size-9",
        "icon-lg": "size-12 [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child element (e.g. a Next.js <Link>) with button styles. */
    asChild?: boolean;
  };

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants, type ButtonProps };
