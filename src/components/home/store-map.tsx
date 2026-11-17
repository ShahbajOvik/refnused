"use client";

import { MapIcon, MapPinIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Click-to-load map. Google Maps is a third party that sets cookies and
 * loads a lot of JS, so nothing loads until the visitor asks for it.
 */
export function StoreMap({ name, address }: { name: string; address: string }) {
  const [show, setShow] = useState(false);

  if (show) {
    return (
      <iframe
        title={`Map showing ${name}, ${address}`}
        src={`https://www.google.com/maps?q=${encodeURIComponent(`${name}, ${address}`)}&output=embed`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="absolute inset-0 size-full border-0"
      />
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] bg-[size:24px_24px] p-4 text-center">
      <MapPinIcon className="size-8 text-primary" aria-hidden />
      <Button variant="secondary" size="sm" onClick={() => setShow(true)}>
        <MapIcon aria-hidden />
        Show map
      </Button>
      <p className="max-w-56 text-xs text-muted-foreground">
        Loads Google Maps, which may set cookies.
      </p>
    </div>
  );
}
