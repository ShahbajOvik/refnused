"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";

import { estimateTradeInAction, type TradeInEstimateResult } from "@/app/(site)/shop/actions";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@refnused/database/lib/format";
import type { TradeInModelOption } from "@refnused/database/lib/shop/catalogue";
import {
  TRADE_IN_CONDITIONS,
  type TradeInConditionKey,
} from "@refnused/database/lib/shop/product-info";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/**
 * Trade in your old phone and see what this one would cost. The estimate
 * is worked out on the server from database prices.
 */
export function TradeInCalculator({
  productId,
  models,
}: {
  productId: string;
  models: TradeInModelOption[];
}) {
  const id = useId();
  const [modelSlug, setModelSlug] = useState("");
  const [storageGb, setStorageGb] = useState("");
  const [condition, setCondition] = useState<TradeInConditionKey>("good");
  const [result, setResult] = useState<TradeInEstimateResult | null>(null);
  const [pending, startTransition] = useTransition();

  const model = models.find((m) => m.slug === modelSlug);
  const brands = [...new Set(models.map((m) => m.brand))];
  const conditionLabel = TRADE_IN_CONDITIONS.find((c) => c.key === condition)?.label;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!modelSlug || !storageGb) {
      setResult({ ok: false, error: "Choose your phone and its storage." });
      return;
    }
    startTransition(async () => {
      setResult(
        await estimateTradeInAction({
          productId,
          modelSlug,
          storageGb: Number(storageGb),
          condition,
        }),
      );
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-model`} className="text-sm font-medium">
          Your current phone
        </label>
        <select
          id={`${id}-model`}
          className={selectClass}
          value={modelSlug}
          onChange={(e) => {
            setModelSlug(e.target.value);
            const next = models.find((m) => m.slug === e.target.value);
            setStorageGb(next?.storage.length === 1 ? String(next.storage[0]) : "");
            setResult(null);
          }}
        >
          <option value="">Choose a phone</option>
          {brands.map((brand) => (
            <optgroup key={brand} label={brand}>
              {models
                .filter((m) => m.brand === brand)
                .map((m) => (
                  <option key={m.slug} value={m.slug}>
                    {m.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-storage`} className="text-sm font-medium">
          Storage
        </label>
        <select
          id={`${id}-storage`}
          className={selectClass}
          value={storageGb}
          disabled={!model}
          onChange={(e) => {
            setStorageGb(e.target.value);
            setResult(null);
          }}
        >
          <option value="">{model ? "Choose storage" : "Choose a phone first"}</option>
          {model?.storage.map((gb) => (
            <option key={gb} value={gb}>
              {gb >= 1024 && gb % 1024 === 0 ? `${gb / 1024}TB` : `${gb}GB`}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="sm:col-span-2">
        <legend className="mb-2 text-sm font-medium">Its condition</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {TRADE_IN_CONDITIONS.map((c) => (
            <label
              key={c.key}
              className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm has-checked:border-primary has-checked:bg-primary/5"
            >
              <input
                type="radio"
                name={`${id}-condition`}
                value={c.key}
                checked={condition === c.key}
                onChange={() => {
                  setCondition(c.key);
                  setResult(null);
                }}
                className="mt-0.5 size-5 shrink-0 accent-(--primary)"
              />
              <span className="flex flex-col">
                <span className="font-medium">{c.label}</span>
                <span className="text-muted-foreground">{c.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending} className="min-h-11">
          {pending ? "Working it out…" : "Work out my saving"}
        </Button>
      </div>

      <div aria-live="polite" className="sm:col-span-2">
        {result?.ok ? (
          <div className="rounded-2xl border bg-muted/40 p-5" data-testid="trade-in-result">
            <p>
              Trade in your {result.tradeInModel} ({conditionLabel?.toLowerCase()}) for up to{" "}
              <strong>{formatPrice(result.saving.tradeInPence)}</strong>.
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {result.saving.payPence > 0 ? (
                <>
                  Pay {formatPrice(result.saving.payPence)}{" "}
                  <span className="text-base font-normal text-muted-foreground">
                    instead of {formatPrice(result.productPricePence)}
                  </span>
                </>
              ) : (
                <>
                  This phone is covered
                  {result.saving.cashBackPence > 0
                    ? `, plus ${formatPrice(result.saving.cashBackPence)} back`
                    : ""}
                </>
              )}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              An estimate for an unlocked phone. Your offer is confirmed after a few quick
              questions, and final once we’ve checked the phone.{" "}
              <Link
                href={result.sellPath}
                className="font-medium text-primary underline underline-offset-4"
              >
                Get a full quote
              </Link>
            </p>
          </div>
        ) : result ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {result.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
