"use client";

import { useId, useState } from "react";

import {
  changePayoutAction,
  createPriceAlertAction,
  deleteAccountAction,
  saveAddressAction,
  sendVerificationCodeAction,
  updateMarketingAction,
} from "@/app/(site)/account/actions";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { ActionForm, fieldError, SubmitButton, type AccountActionResult } from "./action-form";

function Field({
  id,
  label,
  error,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  children: (props: {
    id: string;
    "aria-invalid"?: boolean;
    "aria-describedby"?: string;
  }) => React.ReactNode;
}) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ");
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {children({
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy || undefined,
      })}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

// Addresses -----------------------------------------------------------------------

export type AddressValues = {
  id?: string;
  label?: string | null;
  name?: string;
  line1?: string;
  line2?: string | null;
  town?: string;
  county?: string | null;
  postcode?: string;
  isDefault?: boolean;
};

export function AddressForm({
  address,
  submitLabel,
}: {
  address?: AddressValues;
  submitLabel: string;
}) {
  const id = useId();
  return (
    <ActionForm
      action={saveAddressAction}
      resetOnSuccess={!address?.id}
      label={address?.id ? `Edit address ${address.line1}` : "Add an address"}
    >
      {(state) => (
        <div className="grid gap-4 sm:grid-cols-2">
          {address?.id ? <input type="hidden" name="id" value={address.id} /> : null}
          <Field
            id={`${id}-label`}
            label="Label (optional)"
            hint="For example Home or Work"
            error={fieldError(state, "label")}
          >
            {(p) => (
              <Input {...p} name="label" defaultValue={address?.label ?? ""} maxLength={30} />
            )}
          </Field>
          <Field id={`${id}-name`} label="Full name" error={fieldError(state, "name")}>
            {(p) => (
              <Input {...p} name="name" autoComplete="name" defaultValue={address?.name ?? ""} />
            )}
          </Field>
          <Field
            id={`${id}-line1`}
            label="Address line 1"
            error={fieldError(state, "line1")}
            className="sm:col-span-2"
          >
            {(p) => (
              <Input
                {...p}
                name="line1"
                autoComplete="address-line1"
                defaultValue={address?.line1 ?? ""}
              />
            )}
          </Field>
          <Field id={`${id}-line2`} label="Address line 2 (optional)" className="sm:col-span-2">
            {(p) => (
              <Input
                {...p}
                name="line2"
                autoComplete="address-line2"
                defaultValue={address?.line2 ?? ""}
              />
            )}
          </Field>
          <Field id={`${id}-town`} label="Town or city" error={fieldError(state, "town")}>
            {(p) => (
              <Input
                {...p}
                name="town"
                autoComplete="address-level2"
                defaultValue={address?.town ?? ""}
              />
            )}
          </Field>
          <Field id={`${id}-county`} label="County (optional)">
            {(p) => (
              <Input
                {...p}
                name="county"
                autoComplete="address-level1"
                defaultValue={address?.county ?? ""}
              />
            )}
          </Field>
          <Field id={`${id}-postcode`} label="Postcode" error={fieldError(state, "postcode")}>
            {(p) => (
              <Input
                {...p}
                name="postcode"
                autoComplete="postal-code"
                className="uppercase"
                defaultValue={address?.postcode ?? ""}
              />
            )}
          </Field>
          <label className="flex min-h-11 items-center gap-3 text-sm sm:self-end">
            <input
              type="checkbox"
              name="isDefault"
              defaultChecked={address?.isDefault}
              className="size-5 accent-(--primary)"
            />
            Use as my default address
          </label>
          <div className="sm:col-span-2">
            <SubmitButton>{submitLabel}</SubmitButton>
          </div>
        </div>
      )}
    </ActionForm>
  );
}

// Payout details -----------------------------------------------------------------------

/** Two steps: get an emailed code, then enter it with the new details. */
export function PayoutChangeForm({
  email,
  pendingPayouts,
}: {
  email: string;
  pendingPayouts: number;
}) {
  const id = useId();
  const [codeSent, setCodeSent] = useState(false);

  const sendCode = async (formData: FormData): Promise<AccountActionResult> => {
    const result = await sendVerificationCodeAction(formData);
    if (result.ok) setCodeSent(true);
    return result;
  };

  return (
    <div className="flex flex-col gap-6">
      <ActionForm action={sendCode} label="Send a verification code">
        <input type="hidden" name="purpose" value="payout_change" />
        <p className="text-sm text-muted-foreground">
          For your security, we’ll email a code to {email} before you can change these details.
        </p>
        <SubmitButton
          variant={codeSent ? "outline" : "default"}
          pendingText="Sending…"
          className="mt-3"
        >
          {codeSent ? "Send a new code" : "Send me a code"}
        </SubmitButton>
      </ActionForm>

      {codeSent ? (
        <ActionForm action={changePayoutAction} resetOnSuccess label="New payout details">
          {(state) => (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id={`${id}-code`}
                label="Code from the email"
                error={fieldError(state, "code")}
                className="sm:col-span-2 sm:max-w-48"
              >
                {(p) => (
                  <Input
                    {...p}
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                  />
                )}
              </Field>
              <Field
                id={`${id}-holder`}
                label="Name on the account"
                error={fieldError(state, "bank.accountHolderName")}
                className="sm:col-span-2"
              >
                {(p) => <Input {...p} name="accountHolderName" autoComplete="name" />}
              </Field>
              <Field
                id={`${id}-sort`}
                label="Sort code"
                hint="6 digits, like 12-34-56"
                error={fieldError(state, "bank.sortCode")}
              >
                {(p) => <Input {...p} name="sortCode" inputMode="numeric" autoComplete="off" />}
              </Field>
              <Field
                id={`${id}-account`}
                label="Account number"
                hint="8 digits"
                error={fieldError(state, "bank.accountNumber")}
              >
                {(p) => (
                  <Input {...p} name="accountNumber" inputMode="numeric" autoComplete="off" />
                )}
              </Field>
              {pendingPayouts > 0 ? (
                <label className="flex items-start gap-3 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    name="applyToPending"
                    defaultChecked
                    className="mt-0.5 size-5 accent-(--primary)"
                  />
                  Also use this account for {pendingPayouts} trade-in{" "}
                  {pendingPayouts === 1 ? "payment" : "payments"} we haven’t made yet
                </label>
              ) : null}
              <div className="sm:col-span-2">
                <SubmitButton>Save payout details</SubmitButton>
              </div>
            </div>
          )}
        </ActionForm>
      ) : null}
    </div>
  );
}

// Price alerts ------------------------------------------------------------------------

export function PriceAlertForm({
  models,
}: {
  models: { slug: string; name: string; brand: string }[];
}) {
  const id = useId();
  const [type, setType] = useState<"shop" | "trade_in">("shop");
  const brands = [...new Set(models.map((m) => m.brand))];
  return (
    <ActionForm action={createPriceAlertAction} resetOnSuccess label="New price alert">
      {(state) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-sm font-medium">Tell me when</legend>
            <div className="flex flex-wrap gap-4">
              {(
                [
                  ["shop", "A refurbished phone drops to my price"],
                  ["trade_in", "Your trade-in offer rises to my price"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="type"
                    value={value}
                    checked={type === value}
                    onChange={() => setType(value)}
                    className="size-5 accent-(--primary)"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <Field id={`${id}-model`} label="Phone" error={fieldError(state, "modelSlug")}>
            {(p) => (
              <select {...p} name="modelSlug" defaultValue="" className={selectClass}>
                <option value="" disabled>
                  Choose a phone
                </option>
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
            )}
          </Field>
          <Field
            id={`${id}-target`}
            label="Target price (£)"
            error={fieldError(state, "targetPounds")}
          >
            {(p) => (
              <Input
                {...p}
                name="targetPounds"
                type="number"
                inputMode="numeric"
                min={1}
                max={5000}
                step={1}
              />
            )}
          </Field>
          {type === "shop" ? (
            <Field id={`${id}-grade`} label="Condition (optional)">
              {(p) => (
                <select {...p} name="grade" defaultValue="" className={selectClass}>
                  <option value="">Any grade</option>
                  <option value="A">Grade A · Excellent</option>
                  <option value="B">Grade B · Very good</option>
                  <option value="C">Grade C · Good</option>
                </select>
              )}
            </Field>
          ) : null}
          <div className="sm:col-span-2">
            <SubmitButton>Set alert</SubmitButton>
          </div>
        </div>
      )}
    </ActionForm>
  );
}

// Privacy -----------------------------------------------------------------------------

export function MarketingForm({ email, sms }: { email: boolean; sms: boolean }) {
  return (
    <ActionForm action={updateMarketingAction} label="Marketing preferences">
      <div className="flex flex-col gap-2">
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="email"
            defaultChecked={email}
            className="mt-0.5 size-5 accent-(--primary)"
          />
          <span>
            <span className="font-medium">Emails</span> about offers, new stock and trade-in prices
          </span>
        </label>
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="sms"
            defaultChecked={sms}
            className="mt-0.5 size-5 accent-(--primary)"
          />
          <span>
            <span className="font-medium">Texts</span> about offers in our stores
          </span>
        </label>
        <p className="text-xs text-muted-foreground">
          We’ll still send messages about your orders, trade-ins and account. You can change this at
          any time.
        </p>
        <SubmitButton className="mt-2 self-start">Save preferences</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function DeleteAccountForm({ email }: { email: string }) {
  const id = useId();
  const [codeSent, setCodeSent] = useState(false);
  const sendCode = async (formData: FormData): Promise<AccountActionResult> => {
    const result = await sendVerificationCodeAction(formData);
    if (result.ok) setCodeSent(true);
    return result;
  };
  return (
    <div className="flex flex-col gap-6">
      <ActionForm action={sendCode} label="Send a code to delete your account">
        <input type="hidden" name="purpose" value="delete_account" />
        <p className="text-sm text-muted-foreground">
          We’ll email a code to {email} to check it’s you.
        </p>
        <SubmitButton variant="outline" pendingText="Sending…" className="mt-3">
          {codeSent ? "Send a new code" : "Send me a code"}
        </SubmitButton>
      </ActionForm>
      {codeSent ? (
        <ActionForm action={deleteAccountAction} label="Delete your account">
          {(state) => (
            <div className="grid gap-4 sm:max-w-md">
              <Field
                id={`${id}-code`}
                label="Code from the email"
                error={fieldError(state, "code")}
              >
                {(p) => (
                  <Input
                    {...p}
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                  />
                )}
              </Field>
              <Field
                id={`${id}-confirm`}
                label="Type DELETE to confirm"
                error={fieldError(state, "confirm")}
              >
                {(p) => <Input {...p} name="confirm" autoComplete="off" />}
              </Field>
              <SubmitButton variant="destructive" pendingText="Deleting…" className="self-start">
                Delete my account
              </SubmitButton>
            </div>
          )}
        </ActionForm>
      ) : null}
    </div>
  );
}
