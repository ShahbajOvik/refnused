"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils";

export type GalleryPhoto = { src: string; alt: string };

/**
 * Photos of the actual unit. The first photo is server-rendered and
 * preloaded (it's usually the LCP element); thumbnails switch the main one.
 */
export function ProductGallery({ photos }: { photos: GalleryPhoto[] }) {
  const [index, setIndex] = useState(0);
  const current = photos[index] ?? photos[0];
  if (!current) return null;
  const count = photos.length;
  const go = (next: number) => setIndex((next + count) % count);

  return (
    <div className="flex flex-col gap-3">
      <div
        className="relative aspect-[4/5] overflow-hidden rounded-2xl border bg-muted/40"
        aria-roledescription={count > 1 ? "carousel" : undefined}
        aria-label={count > 1 ? "Photos of this phone" : undefined}
      >
        {photos.map((photo, i) => (
          <Image
            key={photo.src + i}
            src={photo.src}
            alt={photo.alt}
            fill
            sizes="(min-width: 1024px) 45vw, 100vw"
            preload={i === 0}
            loading={i === 0 ? undefined : "lazy"}
            aria-hidden={i !== index}
            className={cn(
              "object-contain p-6 transition-opacity duration-200 motion-reduce:transition-none",
              i === index ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          />
        ))}
        {count > 1 ? (
          <>
            <button
              type="button"
              onClick={() => go(index - 1)}
              aria-label="Previous photo"
              className="absolute top-1/2 left-2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full border bg-background/90 shadow-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <ChevronLeftIcon className="size-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              aria-label="Next photo"
              className="absolute top-1/2 right-2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full border bg-background/90 shadow-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <ChevronRightIcon className="size-5" aria-hidden />
            </button>
            <p
              className="absolute right-3 bottom-3 rounded-full bg-background/90 px-2 py-0.5 text-xs"
              aria-live="polite"
            >
              Photo {index + 1} of {count}
            </p>
          </>
        ) : null}
      </div>
      {count > 1 ? (
        <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Choose a photo">
          {photos.map((photo, i) => (
            <li key={photo.src + i} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show photo ${i + 1}: ${photo.alt}`}
                aria-pressed={i === index}
                className="relative block size-16 overflow-hidden rounded-lg border bg-muted/40 hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-pressed:border-primary aria-pressed:ring-2 aria-pressed:ring-primary/40"
              >
                <Image src={photo.src} alt="" fill sizes="64px" className="object-contain p-1" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
