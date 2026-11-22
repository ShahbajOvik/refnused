"use client";

import Link from "next/link";
import { useCallback, useId, useMemo, useState } from "react";

import { useAdminAction } from "@/app/admin/_components/action-button";
import { FileUploader, type UploadedFile } from "@/app/admin/_components/file-uploader";
import { ImeiScanner } from "@/app/admin/_components/imei-scanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ImeiLookup } from "@/lib/admin/intake";
import { variantLabel } from "@refnused/database/lib/shop/variant-label";
import { isValidImei } from "@refnused/database/lib/validation/uk";

import { createProductAction, lookupImeiAction } from "./actions";

type Category = {
  id: string;
  name: string;
  identifierType: "imei" | "serial" | "none";
  hasBattery: boolean;
  requiresDataWipe: boolean;
};

type Variant = {
  id: string;
  categoryId: string;
  brand: string;
  model: string;
  modelSlug: string;
  storageGb: number | null;
  configuration: string;
  colour: string;
};

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export function IntakeForm({
  categories,
  variants,
  stores,
  defaultStoreId,
}: {
  categories: Category[];
  variants: Variant[];
  stores: { id: string; label: string }[];
  defaultStoreId?: string;
}) {
  const id = useId();
  const { pending, run } = useAdminAction();
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [serialNumber, setSerialNumber] = useState("");
  const [imei, setImei] = useState("");
  const [lookup, setLookup] = useState<ImeiLookup | null>(null);
  const [modelSlug, setModelSlug] = useState("");
  const [variantId, setVariantId] = useState("");
  const [grade, setGrade] = useState("");
  const [photos, setPhotos] = useState<UploadedFile[]>([]);
  const [certificate, setCertificate] = useState<UploadedFile[]>([]);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [created, setCreated] = useState<{ href: string; status: string } | null>(null);

  const category = categories.find((c) => c.id === categoryId);
  const identifierType = category?.identifierType ?? "imei";
  const needsCertificate = category?.requiresDataWipe ?? true;
  const models = useMemo(() => {
    const seen = new Map<string, string>();
    for (const v of variants) {
      if (v.categoryId === categoryId) seen.set(v.modelSlug, `${v.brand} ${v.model}`);
    }
    return [...seen];
  }, [variants, categoryId]);
  const modelVariants = variants.filter((v) => v.modelSlug === modelSlug);
  const chosen = variants.find((v) => v.id === variantId);
  const imeiValid = imei.length === 15 && isValidImei(imei);
  const identifierReady =
    identifierType === "imei"
      ? imeiValid
      : identifierType === "serial"
        ? serialNumber.trim().length >= 3
        : true;

  const doLookup = useCallback(
    (value: string) => {
      setImei(value);
      setLookup(null);
      if (value.length !== 15 || !isValidImei(value)) return;
      run(() => lookupImeiAction({ imei: value }), {
        success: (r) =>
          r.product
            ? "This IMEI is already in stock."
            : r.quote
              ? `Found trade-in ${r.quote.reference}.`
              : "New phone.",
        onSuccess: (r) => {
          setLookup(r);
          if (r.quote) {
            const v = variants.find((x) => x.id === r.quote!.variantId);
            if (v) {
              setModelSlug(v.modelSlug);
              setVariantId(v.id);
            }
            if (r.quote.grade && r.quote.grade !== "faulty") setGrade(r.quote.grade);
          }
        },
      });
    },
    [run, variants],
  );

  const err = (k: string) => errors[k]?.[0];

  if (created) {
    return (
      <div role="status" className="rounded-xl border bg-card p-6">
        <p className="font-medium">
          {created.status === "listed"
            ? "Published to the shop."
            : "Saved as a draft (not on the shop yet)."}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button asChild variant="outline" className="min-h-11">
            <Link href={created.href}>
              {created.status === "listed" ? "View in the shop" : "Find it under Products"}
            </Link>
          </Button>
          <Button
            type="button"
            className="min-h-11"
            onClick={() => {
              setCreated(null);
              setImei("");
              setSerialNumber("");
              setLookup(null);
              setPhotos([]);
              setCertificate([]);
            }}
          >
            Add another item
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="grid gap-5 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        run(
          () =>
            createProductAction({
              imei: identifierType === "imei" ? imei : "",
              serialNumber: identifierType === "serial" ? serialNumber : "",
              variantId,
              grade: grade as "A",
              batteryHealthPercent: data.get("battery") as never,
              pricePounds: data.get("price") as never,
              storeId: String(data.get("storeId") ?? ""),
              warrantyMonths: data.get("warranty") as never,
              photos: photos.map((p) => ({ key: p.key, alt: p.alt })),
              certificateKey: certificate[0]?.key ?? "",
              sourceQuoteId: lookup?.quote?.id ?? "",
              publish: submitter?.value === "publish",
            }),
          {
            success: (p) =>
              p.status === "listed" ? "Published to the shop." : "Saved as a draft.",
            onSuccess: (p) => {
              setErrors({});
              setCreated({
                href:
                  p.status === "listed"
                    ? `/shop/${p.brandSlug}/${p.slug}`
                    : "/admin/products?status=draft",
                status: p.status,
              });
            },
            onError: (r) => setErrors(r.fieldErrors ?? {}),
          },
        );
      }}
    >
      {categories.length > 1 ? (
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <label htmlFor={`${id}-category`} className="text-sm font-medium">
            Category
          </label>
          <select
            id={`${id}-category`}
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setModelSlug("");
              setVariantId("");
              setImei("");
              setSerialNumber("");
              setLookup(null);
              setCertificate([]);
              setErrors({});
            }}
            className={`${selectClass} md:max-w-xs`}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {identifierType === "serial" ? (
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <label htmlFor={`${id}-serial`} className="text-sm font-medium">
            Serial number
          </label>
          <Input
            id={`${id}-serial`}
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            autoComplete="off"
            maxLength={64}
            className="max-w-xs font-mono uppercase"
            aria-describedby={`${id}-serial-hint`}
            aria-invalid={err("serialNumber") ? true : undefined}
          />
          <p id={`${id}-serial-hint`} className="text-xs text-muted-foreground">
            Usually printed on the base or in the system settings.
          </p>
          {err("serialNumber") ? (
            <p className="text-sm text-destructive">{err("serialNumber")}</p>
          ) : null}
        </div>
      ) : null}

      {identifierType === "imei" ? (
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <label htmlFor={`${id}-imei`} className="text-sm font-medium">
            IMEI
          </label>
          <div className="flex flex-wrap gap-2">
            <Input
              id={`${id}-imei`}
              value={imei}
              onChange={(e) => doLookup(e.target.value.replace(/\D/g, "").slice(0, 15))}
              inputMode="numeric"
              autoComplete="off"
              className="max-w-xs font-mono"
              aria-describedby={`${id}-imei-hint`}
              aria-invalid={(imei.length === 15 && !imeiValid) || err("imei") ? true : undefined}
            />
            <ImeiScanner onScan={doLookup} />
          </div>
          <p id={`${id}-imei-hint`} className="text-xs text-muted-foreground">
            15 digits. Dial *#06# on the phone, or scan the box.
            {imei.length === 15 && !imeiValid ? " This IMEI isn’t valid (check digit)." : ""}
          </p>
          {lookup?.product ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              Already in stock ({lookup.product.status}).{" "}
              <Link href={`/admin/products?q=${imei}`} className="underline">
                Open it
              </Link>
            </p>
          ) : lookup?.quote ? (
            <p className="text-sm">
              From trade-in{" "}
              <Link
                href={`/admin/quotes/${lookup.quote.id}`}
                className="font-medium text-primary underline"
              >
                {lookup.quote.reference}
              </Link>{" "}
              ({lookup.quote.device}).
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-model`} className="text-sm font-medium">
          Model
        </label>
        <select
          id={`${id}-model`}
          value={modelSlug}
          onChange={(e) => {
            setModelSlug(e.target.value);
            setVariantId("");
          }}
          className={selectClass}
        >
          <option value="">Choose a model</option>
          {models.map(([slug, name]) => (
            <option key={slug} value={slug}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-variant`} className="text-sm font-medium">
          Options
        </label>
        <select
          id={`${id}-variant`}
          value={variantId}
          onChange={(e) => setVariantId(e.target.value)}
          className={selectClass}
          disabled={!modelSlug}
          aria-invalid={err("variantId") ? true : undefined}
        >
          <option value="">{modelSlug ? "Choose" : "Choose a model first"}</option>
          {modelVariants.map((v) => (
            <option key={v.id} value={v.id}>
              {variantLabel(v, " · ")}
            </option>
          ))}
        </select>
        {err("variantId") ? <p className="text-sm text-destructive">{err("variantId")}</p> : null}
      </div>

      <fieldset className="md:col-span-2">
        <legend className="mb-2 text-sm font-medium">Grade</legend>
        <div className="flex flex-wrap gap-2">
          {(["A", "B", "C"] as const).map((g) => (
            <label
              key={g}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-4 text-sm has-checked:border-primary has-checked:bg-primary/5"
            >
              <input
                type="radio"
                name="grade"
                value={g}
                checked={grade === g}
                onChange={() => setGrade(g)}
                className="size-5 accent-(--primary)"
              />
              Grade {g}
            </label>
          ))}
        </div>
        {err("grade") ? <p className="mt-1 text-sm text-destructive">{err("grade")}</p> : null}
      </fieldset>

      {(
        [
          ...(category?.hasBattery === false
            ? []
            : ([
                [
                  "battery",
                  "Battery health (%)",
                  "batteryHealthPercent",
                  { min: 0, max: 100, step: 1, inputMode: "numeric" as const },
                ],
              ] as const)),
          [
            "price",
            "Price (£)",
            "pricePounds",
            { min: 1, step: "0.01", inputMode: "decimal" as const },
          ],
          [
            "warranty",
            "Warranty (months)",
            "warrantyMonths",
            { min: 0, max: 36, step: 1, inputMode: "numeric" as const, defaultValue: 12 },
          ],
        ] as const
      ).map(([name, label, key, props]) => (
        <div key={name} className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-${name}`} className="text-sm font-medium">
            {label}
          </label>
          <Input
            id={`${id}-${name}`}
            name={name}
            type="number"
            {...props}
            aria-invalid={err(key) ? true : undefined}
          />
          {err(key) ? <p className="text-sm text-destructive">{err(key)}</p> : null}
        </div>
      ))}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-store`} className="text-sm font-medium">
          Store
        </label>
        <select
          id={`${id}-store`}
          name="storeId"
          defaultValue={defaultStoreId ?? ""}
          className={selectClass}
        >
          <option value="">Choose a store</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="md:col-span-2">
        <p className="mb-2 text-sm font-medium">Photos of this item</p>
        <FileUploader
          kind="product-photo"
          label="Take or add photos"
          multiple
          value={photos}
          onChange={setPhotos}
          altPrefix={
            chosen ? `${chosen.brand} ${chosen.model} ${chosen.colour}, photo` : "Item photo"
          }
        />
      </div>
      {needsCertificate ? (
        <div className="md:col-span-2">
          <p className="mb-2 text-sm font-medium">Data-wipe certificate (PDF)</p>
          <FileUploader
            kind="certificate"
            label="Upload certificate"
            value={certificate}
            onChange={setCertificate}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3 md:col-span-2">
        <Button
          type="submit"
          name="intent"
          value="publish"
          disabled={pending || !identifierReady || Boolean(lookup?.product)}
          className="min-h-11"
        >
          {pending ? "Saving…" : "Publish to shop"}
        </Button>
        <Button
          type="submit"
          name="intent"
          value="draft"
          variant="outline"
          disabled={pending || !identifierReady || Boolean(lookup?.product)}
          className="min-h-11"
        >
          Save as draft
        </Button>
        <p className="w-full text-xs text-muted-foreground">
          {needsCertificate
            ? "Publishing needs the certificate and at least one photo."
            : "Publishing needs at least one photo."}
        </p>
      </div>
    </form>
  );
}
