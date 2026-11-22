"use client";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function ToastDemo() {
  return (
    <div className="flex flex-wrap gap-3">
      <Button
        variant="outline"
        onClick={() => toast("Added to basket", { description: "iPhone 15, 128GB, Grade A" })}
      >
        Default toast
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast.success("Quote saved", { description: "We'll hold this price for 14 days." })
        }
      >
        Success toast
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast.error("Payment failed", {
            description: "Your card was declined. Try another card.",
          })
        }
      >
        Error toast
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast("Item removed", {
            action: { label: "Undo", onClick: () => toast.success("Item restored") },
          })
        }
      >
        Toast with action
      </Button>
    </div>
  );
}
