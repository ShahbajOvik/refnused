"use client";

import { CameraIcon, FileTextIcon, XIcon } from "lucide-react";
import { useId, useState } from "react";

import { cn } from "@/lib/utils";

export type UploadedFile = { key: string; url: string; alt: string; name: string };

/**
 * Uploads files as soon as they're picked (photos straight from the camera
 * on phones and tablets). The form then only sends the stored keys.
 */
export function FileUploader({
  kind,
  label,
  multiple = false,
  value,
  onChange,
  altPrefix,
  describedBy,
}: {
  kind: "product-photo" | "inspection-photo" | "certificate" | "store-photo";
  label: string;
  multiple?: boolean;
  value: UploadedFile[];
  onChange: (files: UploadedFile[]) => void;
  /** Photo alt text, e.g. "iPhone 15 front". Each gets a number. */
  altPrefix?: string;
  describedBy?: string;
}) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isPdf = kind === "certificate";

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    setError(null);
    const added: UploadedFile[] = [];
    for (const file of Array.from(list)) {
      const body = new FormData();
      body.set("kind", kind);
      body.set("file", file);
      const response = await fetch("/admin/upload", { method: "POST", body });
      const json = (await response.json().catch(() => ({}))) as {
        key?: string;
        url?: string;
        error?: string;
      };
      if (!response.ok || !json.key) {
        setError(json.error ?? "Upload failed. Try again.");
        break;
      }
      added.push({
        key: json.key,
        url: json.url!,
        name: file.name,
        alt: `${altPrefix ?? "Photo"} ${value.length + added.length}`,
      });
    }
    onChange(multiple ? [...value, ...added] : added.slice(-1));
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className={cn(
          "inline-flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-lg border px-4 text-sm font-medium hover:bg-accent has-focus-visible:ring-2 has-focus-visible:ring-ring",
          busy && "opacity-60",
        )}
      >
        {isPdf ? (
          <FileTextIcon className="size-4" aria-hidden />
        ) : (
          <CameraIcon className="size-4" aria-hidden />
        )}
        {busy ? "Uploading…" : label}
        <input
          id={id}
          type="file"
          className="sr-only"
          multiple={multiple}
          accept={isPdf ? "application/pdf" : "image/*"}
          // Opens the rear camera on phones and tablets.
          capture={isPdf ? undefined : "environment"}
          disabled={busy}
          aria-describedby={describedBy}
          onChange={(e) => {
            void upload(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {value.length ? (
        <ul className="flex flex-wrap gap-2" aria-label={`${label}: uploaded`}>
          {value.map((file, index) => (
            <li key={file.key} className="relative">
              {isPdf ? (
                <a
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm underline"
                >
                  <FileTextIcon className="size-4" aria-hidden /> {file.name}
                </a>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- uploaded preview, not a page image
                <img
                  src={file.url}
                  alt={file.alt}
                  className="size-20 rounded-lg border object-cover"
                />
              )}
              <button
                type="button"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
                className="absolute -top-2 -right-2 inline-flex size-7 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-label={`Remove ${isPdf ? file.name : file.alt}`}
              >
                <XIcon className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
