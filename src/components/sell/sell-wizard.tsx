"use client";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  Loader2Icon,
  LockIcon,
  MailIcon,
  PrinterIcon,
  StoreIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import {
  createQuoteAction,
  getOfferAction,
  type OfferActionResult,
} from "@/app/(site)/sell/actions";
import { FormMessage } from "@/components/auth/auth-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, formatPrice } from "@/lib/format";
import type { PublicQuestion } from "@/lib/sell/offer-service";
import { cn } from "@/lib/utils";

import { ConditionIllustration } from "./condition-illustration";
import { TurnstileWidget } from "./turnstile-widget";

type Variant = { id: string; storageGb: number; colour: string };
type Store = { id: string; name: string; street: string; town: string; postcode: string };
type Offer = Extract<OfferActionResult, { ok: true }>;
type DeliveryMethod = "postage_pack" | "print_label" | "store_drop_off";

const GRADE_LABEL = { A: "Excellent", B: "Very good", C: "Good", faulty: "Faulty" } as const;

/** A radio styled as a selectable card. Native input, so it's fully accessible. */
function OptionCard({
  name,
  value,
  checked,
  onChange,
  label,
  description,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  label: string;
  description?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex min-h-14 cursor-pointer items-center gap-4 rounded-xl border bg-card p-4 transition-colors hover:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2",
        checked && "border-primary bg-primary/5 ring-1 ring-primary",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="size-5 shrink-0 accent-(--primary)"
      />
      {children}
      <span className="flex flex-col">
        <span className="font-medium">{label}</span>
        {description ? <span className="text-sm text-muted-foreground">{description}</span> : null}
      </span>
    </label>
  );
}

function Field({
  id,
  label,
  error,
  hint,
  ...props
}: React.ComponentProps<typeof Input> & {
  id: string;
  label: string;
  error?: string;
  hint?: string;
}) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...props}
      />
    </div>
  );
}

export function SellWizard({
  model,
  variants,
  questions,
  stores,
  priceLockDays,
  turnstileSiteKey,
}: {
  model: { name: string; brandName: string };
  variants: Variant[];
  questions: PublicQuestion[];
  stores: Store[];
  priceLockDays: number;
  turnstileSiteKey?: string;
}) {
  const router = useRouter();
  const uid = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const errorSummary = useRef<HTMLDivElement>(null);

  const deviceQuestions = questions.filter((q) => q.section === "device");
  const conditionQuestions = questions.filter((q) => q.section === "condition");
  const storages = useMemo(() => [...new Set(variants.map((v) => v.storageGb))], [variants]);

  const [step, setStep] = useState(0); // 0 = device, 1..n = condition, n+1 = offer, n+2 = details
  const [storage, setStorage] = useState<number | null>(
    storages.length === 1 ? storages[0]! : null,
  );
  const [colour, setColour] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [offer, setOffer] = useState<Offer | null>(null);
  const [priceLockedUntil, setPriceLockedUntil] = useState<Date | null>(null);
  const [delivery, setDelivery] = useState<DeliveryMethod>("postage_pack");
  const [storeId, setStoreId] = useState<string | null>(stores[0]?.id ?? null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const colours = variants.filter((v) => v.storageGb === storage).map((v) => v.colour);
  const variant = variants.find((v) => v.storageGb === storage && v.colour === colour) ?? null;
  const offerStep = conditionQuestions.length + 1;
  const detailsStep = offerStep + 1;
  const totalSteps = detailsStep + 1;

  // Move focus to the new step's heading so screen readers announce it.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    heading.current?.focus();
  }, [step]);

  const go = (next: number) => {
    setError(null);
    setStep(next);
  };

  const fetchOffer = async () => {
    if (!variant) return;
    setPending(true);
    setError(null);
    const result = await getOfferAction({ variantId: variant.id, answers });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOffer(result);
    setPriceLockedUntil(new Date(Date.now() + priceLockDays * 86_400_000));
    go(offerStep);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!variant || !offer) return;
    const form = new FormData(event.currentTarget);
    const get = (k: string) => String(form.get(k) ?? "");
    setPending(true);
    setError(null);
    setFieldErrors({});
    const result = await createQuoteAction(
      {
        variantId: variant.id,
        answers,
        expectedOfferPence: offer.offerPence,
        delivery:
          delivery === "store_drop_off" ? { method: delivery, storeId } : { method: delivery },
        name: get("name"),
        email: get("email"),
        phone: get("phone"),
        address: {
          line1: get("line1"),
          line2: get("line2"),
          town: get("town"),
          postcode: get("postcode"),
        },
        imei: get("imei"),
        bank: {
          accountHolderName: get("accountHolderName"),
          sortCode: get("sortCode"),
          accountNumber: get("accountNumber"),
        },
        declarations: {
          owner: form.get("owner") === "on",
          activationLockOff: form.get("activationLockOff") === "on",
        },
      },
      turnstileToken,
    );
    if (result.ok) {
      router.push(result.trackingPath);
      return;
    }
    setPending(false);
    setError(result.error);
    setFieldErrors(result.fieldErrors ?? {});
    if (result.newOfferPence !== undefined)
      setOffer({ ...offer, offerPence: result.newOfferPence });
    requestAnimationFrame(() => errorSummary.current?.focus());
  };

  const fe = (path: string) => fieldErrors[path]?.[0];
  const stepLabel = `Step ${step + 1} of ${totalSteps}`;

  const nav = (canContinue: boolean, onContinue: () => void, continueLabel = "Continue") => (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      {step > 0 ? (
        <Button type="button" variant="outline" onClick={() => go(step - 1)}>
          <ArrowLeftIcon aria-hidden />
          Back
        </Button>
      ) : null}
      <Button type="button" onClick={onContinue} disabled={!canContinue || pending}>
        {pending ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
        {continueLabel}
        {!pending ? <ArrowRightIcon aria-hidden /> : null}
      </Button>
    </div>
  );

  let body: React.ReactNode;

  if (step === 0) {
    body = (
      <>
        <h2 ref={heading} tabIndex={-1} className="text-2xl font-semibold focus:outline-none">
          About your {model.name}
        </h2>
        <fieldset className="mt-6">
          <legend className="mb-3 font-medium">Storage</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {storages.map((gb) => (
              <OptionCard
                key={gb}
                name={`${uid}-storage`}
                value={String(gb)}
                checked={storage === gb}
                onChange={(v) => {
                  setStorage(Number(v));
                  setColour(null);
                }}
                label={gb >= 1024 ? `${gb / 1024}TB` : `${gb}GB`}
              />
            ))}
          </div>
        </fieldset>
        {storage !== null ? (
          <fieldset className="mt-6">
            <legend className="mb-3 font-medium">Colour</legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {colours.map((c) => (
                <OptionCard
                  key={c}
                  name={`${uid}-colour`}
                  value={c}
                  checked={colour === c}
                  onChange={setColour}
                  label={c}
                />
              ))}
            </div>
          </fieldset>
        ) : null}
        {deviceQuestions.map((q) => (
          <fieldset key={q.key} className="mt-6">
            <legend className="mb-1 font-medium">{q.title}</legend>
            {q.help ? <p className="mb-3 text-sm text-muted-foreground">{q.help}</p> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              {q.options.map((o) => (
                <OptionCard
                  key={o.key}
                  name={`${uid}-${q.key}`}
                  value={o.key}
                  checked={answers[q.key] === o.key}
                  onChange={(v) => setAnswers((a) => ({ ...a, [q.key]: v }))}
                  label={o.label}
                  description={o.description}
                />
              ))}
            </div>
          </fieldset>
        ))}
        {nav(!!variant && deviceQuestions.every((q) => answers[q.key]), () => go(1))}
      </>
    );
  } else if (step <= conditionQuestions.length) {
    const q = conditionQuestions[step - 1]!;
    const isLast = step === conditionQuestions.length;
    body = (
      <fieldset>
        <legend className="contents">
          <h2 ref={heading} tabIndex={-1} className="text-2xl font-semibold focus:outline-none">
            {q.title}
          </h2>
        </legend>
        {q.help ? <p className="mt-2 text-muted-foreground">{q.help}</p> : null}
        <div className="mt-6 grid gap-3">
          {q.options.map((o) => (
            <OptionCard
              key={o.key}
              name={`${uid}-${q.key}`}
              value={o.key}
              checked={answers[q.key] === o.key}
              onChange={(v) => setAnswers((a) => ({ ...a, [q.key]: v }))}
              label={o.label}
              description={o.description}
            >
              <ConditionIllustration name={o.illustration} className="shrink-0" />
            </OptionCard>
          ))}
        </div>
        {nav(
          !!answers[q.key],
          isLast ? fetchOffer : () => go(step + 1),
          isLast ? "See my offer" : "Continue",
        )}
      </fieldset>
    );
  } else if (step === offerStep && offer) {
    body = (
      <>
        <h2 ref={heading} tabIndex={-1} className="text-2xl font-semibold focus:outline-none">
          Your instant offer
        </h2>
        <div className="mt-4 rounded-2xl bg-primary p-6 text-primary-foreground">
          <p className="text-sm">
            {model.brandName} {model.name}, {storage}GB, {colour}
          </p>
          <p className="mt-1 text-5xl font-semibold tabular-nums" data-testid="offer-amount">
            {formatPrice(offer.offerPence)}
          </p>
          <p className="mt-2 flex items-center gap-2 text-sm">
            <LockIcon className="size-4" aria-hidden />
            Locked for {priceLockDays} days when you accept{" "}
            {priceLockedUntil ? `(until ${formatDate(priceLockedUntil)})` : null}
          </p>
        </div>
        <details className="mt-4 rounded-xl border p-4 text-sm">
          <summary className="cursor-pointer font-medium">How we worked this out</summary>
          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
            <dt>
              Condition grade <Badge variant="outline">{GRADE_LABEL[offer.grade]}</Badge>
            </dt>
            <dd className="text-right tabular-nums">{formatPrice(offer.basePricePence)}</dd>
            {offer.deductions.map((d) => (
              <div key={d.questionKey} className="contents">
                <dt className="text-muted-foreground">{d.label}</dt>
                <dd className="text-right text-muted-foreground tabular-nums">
                  −{formatPrice(d.amountPence)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-muted-foreground">
            Offers are rounded down to the nearest pound.
          </p>
        </details>

        {offer.acceptableOnline ? (
          <>
            <fieldset className="mt-6">
              <legend className="mb-3 font-medium">How would you like to send it?</legend>
              <div className="grid gap-3">
                <OptionCard
                  name={`${uid}-delivery`}
                  value="postage_pack"
                  checked={delivery === "postage_pack"}
                  onChange={() => setDelivery("postage_pack")}
                  label="Free postage pack"
                  description="We’ll post you a padded pack with a prepaid label."
                >
                  <MailIcon className="size-6 shrink-0 text-primary" aria-hidden />
                </OptionCard>
                <OptionCard
                  name={`${uid}-delivery`}
                  value="print_label"
                  checked={delivery === "print_label"}
                  onChange={() => setDelivery("print_label")}
                  label="Print a label"
                  description="Use your own packaging and print the label at home."
                >
                  <PrinterIcon className="size-6 shrink-0 text-primary" aria-hidden />
                </OptionCard>
                <OptionCard
                  name={`${uid}-delivery`}
                  value="store_drop_off"
                  checked={delivery === "store_drop_off"}
                  onChange={() => setDelivery("store_drop_off")}
                  label="Drop it off in store"
                  description="Bring it in and we’ll check it with you."
                >
                  <StoreIcon className="size-6 shrink-0 text-primary" aria-hidden />
                </OptionCard>
              </div>
            </fieldset>
            {delivery === "store_drop_off" ? (
              <fieldset className="mt-6">
                <legend className="mb-3 font-medium">Which store?</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {stores.map((s) => (
                    <OptionCard
                      key={s.id}
                      name={`${uid}-store`}
                      value={s.id}
                      checked={storeId === s.id}
                      onChange={setStoreId}
                      label={`${s.name}, ${s.town}`}
                      description={`${s.street}, ${s.postcode}`}
                    />
                  ))}
                </div>
              </fieldset>
            ) : null}
            {nav(
              delivery !== "store_drop_off" || !!storeId,
              () => go(detailsStep),
              "Accept and continue",
            )}
          </>
        ) : (
          <>
            <FormMessage tone="info">
              We can’t accept this phone online, but we may still be able to help. Bring it to one
              of our{" "}
              <Link href="/stores" className="font-medium underline">
                stores
              </Link>{" "}
              and we’ll take a look.
            </FormMessage>
            {nav(false, () => undefined)}
          </>
        )}
      </>
    );
  } else if (step === detailsStep && offer) {
    const errorEntries = Object.entries(fieldErrors);
    body = (
      <form onSubmit={submit} noValidate>
        <h2 ref={heading} tabIndex={-1} className="text-2xl font-semibold focus:outline-none">
          Your details
        </h2>
        <p className="mt-1 text-muted-foreground">
          Accepting {formatPrice(offer.offerPence)} for your {model.name}.
        </p>

        {error ? (
          <div
            ref={errorSummary}
            tabIndex={-1}
            role="alert"
            className="mt-4 rounded-xl border-2 border-destructive p-4 focus:outline-none"
          >
            <p className="font-semibold text-destructive">{error}</p>
            {errorEntries.length ? (
              <ul className="mt-2 list-disc pl-5 text-sm">
                {errorEntries.map(([path, messages]) => (
                  <li key={path}>
                    <a
                      href={`#${uid}-${path.replace(/\./g, "-")}`}
                      className="text-destructive underline"
                    >
                      {messages[0]}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <fieldset className="mt-6 grid gap-4">
          <legend className="mb-1 text-lg font-semibold">Contact</legend>
          <Field
            id={`${uid}-name`}
            name="name"
            label="Full name"
            autoComplete="name"
            required
            error={fe("name")}
          />
          <Field
            id={`${uid}-email`}
            name="email"
            type="email"
            label="Email"
            autoComplete="email"
            required
            error={fe("email")}
          />
          <Field
            id={`${uid}-phone`}
            name="phone"
            type="tel"
            label="Mobile number"
            autoComplete="tel"
            hint="We’ll text you updates about your trade-in."
            required
            error={fe("phone")}
          />
        </fieldset>

        <fieldset className="mt-6 grid gap-4">
          <legend className="mb-1 text-lg font-semibold">Address</legend>
          <Field
            id={`${uid}-address-line1`}
            name="line1"
            label="Address line 1"
            autoComplete="address-line1"
            required
            error={fe("address.line1")}
          />
          <Field
            id={`${uid}-address-line2`}
            name="line2"
            label="Address line 2 (optional)"
            autoComplete="address-line2"
            error={fe("address.line2")}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id={`${uid}-address-town`}
              name="town"
              label="Town or city"
              autoComplete="address-level2"
              required
              error={fe("address.town")}
            />
            <Field
              id={`${uid}-address-postcode`}
              name="postcode"
              label="Postcode"
              autoComplete="postal-code"
              className="uppercase"
              required
              error={fe("address.postcode")}
            />
          </div>
        </fieldset>

        <fieldset className="mt-6 grid gap-4">
          <legend className="mb-1 text-lg font-semibold">Your phone</legend>
          <Field
            id={`${uid}-imei`}
            name="imei"
            label="IMEI number"
            inputMode="numeric"
            autoComplete="off"
            hint="Dial *#06# on the phone to see it. It’s 15 digits."
            required
            error={fe("imei")}
          />
        </fieldset>

        <fieldset className="mt-6 grid gap-4">
          <legend className="mb-1 text-lg font-semibold">Where should we pay you?</legend>
          <p className="-mt-2 text-sm text-muted-foreground">
            UK bank account. Your details are encrypted and only used to pay you.
          </p>
          <Field
            id={`${uid}-bank-accountHolderName`}
            name="accountHolderName"
            label="Name on the account"
            autoComplete="cc-name"
            required
            error={fe("bank.accountHolderName")}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id={`${uid}-bank-sortCode`}
              name="sortCode"
              label="Sort code"
              inputMode="numeric"
              autoComplete="off"
              hint="6 digits, like 12-34-56"
              required
              error={fe("bank.sortCode")}
            />
            <Field
              id={`${uid}-bank-accountNumber`}
              name="accountNumber"
              label="Account number"
              inputMode="numeric"
              autoComplete="off"
              hint="8 digits"
              required
              error={fe("bank.accountNumber")}
            />
          </div>
        </fieldset>

        <fieldset className="mt-6 grid gap-3">
          <legend className="mb-1 text-lg font-semibold">Declaration</legend>
          {[
            {
              id: "owner",
              path: "declarations.owner",
              text: "I own this phone (or have the owner’s permission), it isn’t lost, stolen or on finance, and I’m 18 or over.",
            },
            {
              id: "activationLockOff",
              path: "declarations.activationLockOff",
              text: "I’ve turned off Find My iPhone / Google account lock (Factory Reset Protection). Locked phones can’t be bought.",
            },
          ].map((d) => (
            <div key={d.id}>
              {fe(d.path) ? (
                <p className="mb-1 text-sm font-medium text-destructive">{fe(d.path)}</p>
              ) : null}
              <label
                htmlFor={`${uid}-declarations-${d.id}`}
                className="flex cursor-pointer gap-3 rounded-xl border p-4"
              >
                <input
                  id={`${uid}-declarations-${d.id}`}
                  type="checkbox"
                  name={d.id}
                  className="mt-0.5 size-5 shrink-0 accent-(--primary)"
                  aria-invalid={fe(d.path) ? true : undefined}
                />
                <span className="text-sm">{d.text}</span>
              </label>
            </div>
          ))}
        </fieldset>

        {turnstileSiteKey ? (
          <div className="mt-6">
            <TurnstileWidget
              siteKey={turnstileSiteKey}
              action="sell_quote"
              onToken={setTurnstileToken}
            />
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={() => go(offerStep)}>
            <ArrowLeftIcon aria-hidden />
            Back
          </Button>
          <Button
            type="submit"
            size="lg"
            disabled={pending || (!!turnstileSiteKey && !turnstileToken)}
          >
            {pending ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
            Accept {formatPrice(offer.offerPence)} and get my quote
          </Button>
        </div>
      </form>
    );
  }

  return (
    <section aria-label="Get your quote" className="rounded-2xl border bg-card p-5 sm:p-8">
      <div className="mb-4 flex items-center justify-between gap-4 text-sm text-muted-foreground">
        <span aria-live="polite">{stepLabel}</span>
        <span aria-hidden className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
          <span
            className="block h-full rounded-full bg-primary transition-all"
            style={{ width: `${((step + 1) / totalSteps) * 100}%` }}
          />
        </span>
      </div>
      {error && step !== detailsStep ? (
        <div className="mb-4">
          <FormMessage>{error}</FormMessage>
        </div>
      ) : null}
      {body}
    </section>
  );
}
