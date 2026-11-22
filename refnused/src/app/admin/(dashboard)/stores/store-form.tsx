"use client";

import { useId, useState } from "react";

import { useAdminAction } from "@/app/admin/_components/action-button";
import { FileUploader, type UploadedFile } from "@/app/admin/_components/file-uploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OpeningHours } from "@refnused/database/db/schema/stores";
import { DAYS } from "@refnused/database/lib/stores";

import { updateStoreAction } from "./actions";

export type StoreValues = {
  id: string;
  name: string;
  street: string;
  town: string;
  postcode: string;
  phone: string;
  email: string | null;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
  openingHours: OpeningHours | null;
  parkingInfo: string | null;
  nearestMetro: string | null;
  photos: UploadedFile[];
};

export function StoreForm({ store }: { store: StoreValues }) {
  const id = useId();
  const { pending, run } = useAdminAction();
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [closed, setClosed] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      DAYS.map((d) => [
        d.key,
        store.openingHours ? store.openingHours[d.key] === null : d.key === "sun",
      ]),
    ),
  );
  const [photos, setPhotos] = useState<UploadedFile[]>(store.photos);
  const err = (k: string) => errors[k]?.[0];
  const area = (name: "parkingInfo" | "nearestMetro", label: string, hint: string) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${id}-${name}`} className="text-sm font-medium">
        {label}
      </label>
      <p id={`${id}-${name}-hint`} className="text-sm text-muted-foreground">
        {hint}
      </p>
      <textarea
        id={`${id}-${name}`}
        name={name}
        rows={2}
        maxLength={300}
        defaultValue={store[name] ?? ""}
        aria-describedby={`${id}-${name}-hint`}
        aria-invalid={err(name) ? true : undefined}
        className="rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      {err(name) ? <p className="text-sm text-destructive">{err(name)}</p> : null}
    </div>
  );

  const text = (
    name: keyof StoreValues,
    label: string,
    props: React.ComponentProps<"input"> = {},
  ) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${id}-${name}`} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={`${id}-${name}`}
        name={name}
        defaultValue={store[name] === null ? "" : String(store[name])}
        aria-invalid={err(name) ? true : undefined}
        {...props}
      />
      {err(name) ? <p className="text-sm text-destructive">{err(name)}</p> : null}
    </div>
  );

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const get = (k: string) => String(data.get(k) ?? "");
        run(
          () =>
            updateStoreAction({
              storeId: store.id,
              name: get("name"),
              street: get("street"),
              town: get("town"),
              postcode: get("postcode"),
              phone: get("phone"),
              email: get("email"),
              latitude: get("latitude") as never,
              longitude: get("longitude") as never,
              isActive: data.get("isActive") === "on",
              parkingInfo: get("parkingInfo"),
              nearestMetro: get("nearestMetro"),
              photos: photos.map((p) => ({ key: p.key, alt: p.alt })),
              hours: Object.fromEntries(
                DAYS.map((d) => [
                  d.key,
                  closed[d.key]
                    ? { closed: true }
                    : {
                        closed: false,
                        opens: get(`${d.key}-opens`),
                        closes: get(`${d.key}-closes`),
                      },
                ]),
              ) as never,
            }),
          {
            success: "Store saved. The website updates within a few minutes.",
            onSuccess: () => setErrors({}),
            onError: (r) => setErrors(r.fieldErrors ?? {}),
          },
        );
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {text("name", "Name")}
        {text("phone", "Phone", { type: "tel", inputMode: "tel" })}
        {text("street", "Street")}
        {text("town", "Town")}
        {text("postcode", "Postcode", { className: "uppercase" })}
        {text("email", "Email (optional)", { type: "email" })}
        {text("latitude", "Latitude (optional)", { inputMode: "decimal" })}
        {text("longitude", "Longitude (optional)", { inputMode: "decimal" })}
      </div>
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 font-medium">Getting here (shown on the store page)</legend>
        {area(
          "parkingInfo",
          "Parking",
          "E.g. where the nearest car park is and how long you can stay.",
        )}
        {area(
          "nearestMetro",
          "Nearest Metro station",
          "E.g. “North Shields Metro station is a 5-minute walk.”",
        )}
      </fieldset>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-medium">Photos</legend>
        <FileUploader
          kind="store-photo"
          label="Add store photos"
          multiple
          value={photos}
          onChange={setPhotos}
          altPrefix={`${store.name} store photo`}
        />
        {err("photos") ? <p className="text-sm text-destructive">{err("photos")}</p> : null}
        {photos.map((photo, index) => (
          <div key={photo.key} className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-alt-${index}`} className="text-sm font-medium">
              Photo {index + 1} description (for screen readers)
            </label>
            <Input
              id={`${id}-alt-${index}`}
              value={photo.alt}
              maxLength={200}
              onChange={(e) =>
                setPhotos((list) =>
                  list.map((p, i) => (i === index ? { ...p, alt: e.target.value } : p)),
                )
              }
            />
          </div>
        ))}
      </fieldset>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={store.isActive}
          className="size-5 accent-(--primary)"
        />
        Open to customers (shown on the website, offered for collection and drop-off)
      </label>
      <fieldset>
        <legend className="mb-2 font-medium">Opening hours (24-hour, UK time)</legend>
        {err("hours") ? <p className="mb-2 text-sm text-destructive">{err("hours")}</p> : null}
        <div className="flex flex-col divide-y rounded-lg border">
          {DAYS.map((d) => {
            const h = store.openingHours?.[d.key];
            return (
              <div key={d.key} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <span className="w-24 font-medium">{d.long}</span>
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={closed[d.key]}
                    onChange={(e) => setClosed((c) => ({ ...c, [d.key]: e.target.checked }))}
                    className="size-5 accent-(--primary)"
                  />
                  Closed
                </label>
                {closed[d.key] ? null : (
                  <>
                    <label className="flex items-center gap-2 text-sm">
                      Opens
                      <input
                        type="time"
                        name={`${d.key}-opens`}
                        defaultValue={h?.opens ?? "09:00"}
                        className="h-10 rounded-md border border-input bg-background px-2"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      Closes
                      <input
                        type="time"
                        name={`${d.key}-closes`}
                        defaultValue={h?.closes ?? "17:30"}
                        className="h-10 rounded-md border border-input bg-background px-2"
                      />
                    </label>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </fieldset>
      <Button type="submit" disabled={pending} className="min-h-11 self-start">
        {pending ? "Saving…" : "Save store"}
      </Button>
    </form>
  );
}
