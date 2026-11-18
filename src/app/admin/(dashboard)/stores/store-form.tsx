"use client";

import { useId, useState } from "react";

import { useAdminAction } from "@/app/admin/_components/action-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OpeningHours } from "@/db/schema/stores";
import { DAYS } from "@/lib/stores";

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
  const err = (k: string) => errors[k]?.[0];

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
