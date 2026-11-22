"use client";

import { useId, useRef, useState } from "react";

import { ActionButton, useAdminAction } from "@/app/admin/_components/action-button";
import type { ActionResult } from "@/auth/guards";
import { FormMessage } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CatalogueData } from "@/lib/admin/catalogue";
import { variantLabel } from "@refnused/database/lib/shop/variant-label";

import {
  addVariantsAction,
  createBrandAction,
  createCategoryAction,
  createModelAction,
  setVariantActiveAction,
  updateCategoryAction,
  updateModelAction,
} from "./actions";

type Category = CatalogueData["categories"][number];
type Brand = CatalogueData["brands"][number];
type Model = CatalogueData["models"][number];

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
const textareaClass =
  "min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/** Runs a form's action and keeps the first problem on screen. */
function useCatalogueForm() {
  const { pending, run } = useAdminAction();
  const [error, setError] = useState<string>();
  function submit<T>(
    action: () => Promise<ActionResult<T>>,
    success: string | ((data: T) => string),
    onSuccess?: () => void,
  ) {
    run(action, {
      success,
      onSuccess: () => {
        setError(undefined);
        onSuccess?.();
      },
      onError: (r) => setError(Object.values(r.fieldErrors ?? {})[0]?.[0] ?? r.error),
    });
  }
  return { pending, error, submit };
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (props: { id: string; "aria-describedby"?: string }) => React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children({ id, "aria-describedby": hint ? `${id}-hint` : undefined })}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function Check({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-sm">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="size-5 shrink-0 accent-(--primary)"
      />
      {label}
    </label>
  );
}

function categoryValues(data: FormData) {
  return {
    name: String(data.get("name") ?? ""),
    description: String(data.get("description") ?? ""),
    sortOrder: Number(data.get("sortOrder") ?? 0),
    identifierType: String(data.get("identifierType")) as Category["identifierType"],
    hasStorage: data.get("hasStorage") === "on",
    hasBattery: data.get("hasBattery") === "on",
    requiresDataWipe: data.get("requiresDataWipe") === "on",
  };
}

function CategoryFields({ category }: { category?: Category }) {
  return (
    <>
      <Field label="Category name">
        {(props) => (
          <Input
            {...props}
            name="name"
            required
            maxLength={80}
            defaultValue={category?.name}
            autoComplete="off"
          />
        )}
      </Field>
      <Field label="Position in the shop" hint="Lower numbers appear first.">
        {(props) => (
          <Input
            {...props}
            name="sortOrder"
            type="number"
            min={0}
            max={999}
            defaultValue={category?.sortOrder ?? 10}
          />
        )}
      </Field>
      <div className="md:col-span-2">
        <Field label="Description (optional)" hint="Shown at the top of the category page.">
          {(props) => (
            <textarea
              {...props}
              name="description"
              maxLength={300}
              defaultValue={category?.description ?? ""}
              className={textareaClass}
            />
          )}
        </Field>
      </div>
      <Field label="How is each item identified?">
        {(props) => (
          <select
            {...props}
            name="identifierType"
            defaultValue={category?.identifierType ?? "serial"}
            className={selectClass}
          >
            <option value="serial">Serial number</option>
            <option value="imei">IMEI (phones and cellular tablets)</option>
            <option value="none">Automatic stock code (accessories)</option>
          </select>
        )}
      </Field>
      <fieldset className="flex flex-col">
        <legend className="mb-1 text-sm font-medium">Items in this category</legend>
        <Check
          name="hasStorage"
          label="Have storage (GB or TB)"
          defaultChecked={category?.hasStorage ?? true}
        />
        <Check
          name="hasBattery"
          label="Have a battery to test"
          defaultChecked={category?.hasBattery ?? true}
        />
        <Check
          name="requiresDataWipe"
          label="Need a data-wipe certificate"
          defaultChecked={category?.requiresDataWipe ?? true}
        />
      </fieldset>
    </>
  );
}

export function NewCategoryForm() {
  const { pending, error, submit } = useCatalogueForm();
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={formRef}
      className="grid gap-4 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const values = categoryValues(new FormData(event.currentTarget));
        submit(
          () => createCategoryAction(values),
          `${values.name} added.`,
          () => formRef.current?.reset(),
        );
      }}
    >
      <CategoryFields />
      {error ? (
        <div className="md:col-span-2">
          <FormMessage>{error}</FormMessage>
        </div>
      ) : null}
      <Button type="submit" disabled={pending} className="min-h-11 md:w-fit">
        {pending ? "Saving…" : "Add category"}
      </Button>
    </form>
  );
}

export function EditCategoryForm({ category }: { category: Category }) {
  const { pending, error, submit } = useCatalogueForm();
  return (
    <form
      className="grid gap-4 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        submit(
          () =>
            updateCategoryAction({
              ...categoryValues(data),
              categoryId: category.id,
              isActive: data.get("isActive") === "on",
            }),
          "Category saved.",
        );
      }}
    >
      <CategoryFields category={category} />
      <Check name="isActive" label="Show this category" defaultChecked={category.isActive} />
      {error ? (
        <div className="md:col-span-2">
          <FormMessage>{error}</FormMessage>
        </div>
      ) : null}
      <Button type="submit" disabled={pending} className="min-h-11 md:col-span-2 md:w-fit">
        {pending ? "Saving…" : "Save category"}
      </Button>
    </form>
  );
}

export function NewBrandForm() {
  const { pending, error, submit } = useCatalogueForm();
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={formRef}
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const name = String(new FormData(event.currentTarget).get("name") ?? "");
        submit(
          () => createBrandAction({ name }),
          `${name} added.`,
          () => formRef.current?.reset(),
        );
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-xs">
          <Field label="New brand">
            {(props) => <Input {...props} name="name" required maxLength={80} autoComplete="off" />}
          </Field>
        </div>
        <Button type="submit" disabled={pending} className="min-h-11">
          {pending ? "Saving…" : "Add brand"}
        </Button>
      </div>
      {error ? <FormMessage>{error}</FormMessage> : null}
    </form>
  );
}

function OptionFields({ hasStorage }: { hasStorage: boolean }) {
  return (
    <>
      {hasStorage ? (
        <Field label="Storage sizes" hint="Separate with commas, e.g. 256GB, 512GB, 1TB">
          {(props) => <Input {...props} name="storage" required autoComplete="off" />}
        </Field>
      ) : null}
      <Field label="Colours" hint="Separate with commas, e.g. Black, Silver">
        {(props) => <Input {...props} name="colours" required autoComplete="off" />}
      </Field>
      <div className="md:col-span-2">
        <Field
          label="Other specifications (optional)"
          hint="One option per line, e.g. 16GB RAM Intel Core i5"
        >
          {(props) => <textarea {...props} name="configurations" className={textareaClass} />}
        </Field>
      </div>
    </>
  );
}

const optionValues = (data: FormData) => ({
  storage: String(data.get("storage") ?? ""),
  colours: String(data.get("colours") ?? ""),
  configurations: String(data.get("configurations") ?? ""),
});

export function NewModelForm({
  categories,
  brands,
  defaultCategoryId,
}: {
  categories: Category[];
  brands: Brand[];
  defaultCategoryId?: string;
}) {
  const { pending, error, submit } = useCatalogueForm();
  const formRef = useRef<HTMLFormElement>(null);
  const [categoryId, setCategoryId] = useState(defaultCategoryId ?? categories[0]?.id ?? "");
  const category = categories.find((c) => c.id === categoryId);

  return (
    <form
      ref={formRef}
      className="grid gap-4 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const name = String(data.get("name") ?? "");
        submit(
          () =>
            createModelAction({
              categoryId,
              brandId: String(data.get("brandId") ?? ""),
              name,
              releaseYear: Number(data.get("releaseYear")),
              ...optionValues(data),
            }),
          (model) =>
            `${name} added with ${model.variants} ${model.variants === 1 ? "option" : "options"}.`,
          () => formRef.current?.reset(),
        );
      }}
    >
      <Field label="Category">
        {(props) => (
          <select
            {...props}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className={selectClass}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Brand">
        {(props) => (
          <select {...props} name="brandId" required defaultValue="" className={selectClass}>
            <option value="" disabled>
              Choose a brand
            </option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Model name">
        {(props) => <Input {...props} name="name" required maxLength={80} autoComplete="off" />}
      </Field>
      <Field label="Release year">
        {(props) => (
          <Input
            {...props}
            name="releaseYear"
            type="number"
            required
            min={2007}
            max={2100}
            defaultValue={new Date().getFullYear()}
          />
        )}
      </Field>
      <OptionFields hasStorage={category?.hasStorage ?? true} />
      {category?.identifierType === "imei" ? (
        <p className="text-sm text-muted-foreground md:col-span-2">
          Customers can sell you this model once you set its trade-in prices under Prices.
        </p>
      ) : null}
      {error ? (
        <div className="md:col-span-2">
          <FormMessage>{error}</FormMessage>
        </div>
      ) : null}
      <Button type="submit" disabled={pending} className="min-h-11 md:w-fit">
        {pending ? "Saving…" : "Add model"}
      </Button>
    </form>
  );
}

export function EditModelForm({ model }: { model: Model }) {
  const { pending, error, submit } = useCatalogueForm();
  return (
    <form
      className="grid gap-4 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        submit(
          () =>
            updateModelAction({
              modelId: model.id,
              name: String(data.get("name") ?? ""),
              releaseYear: Number(data.get("releaseYear")),
              isActive: data.get("isActive") === "on",
            }),
          "Model saved.",
        );
      }}
    >
      <Field label="Model name">
        {(props) => (
          <Input
            {...props}
            name="name"
            required
            maxLength={80}
            defaultValue={model.name}
            autoComplete="off"
          />
        )}
      </Field>
      <Field label="Release year">
        {(props) => (
          <Input
            {...props}
            name="releaseYear"
            type="number"
            required
            min={2007}
            max={2100}
            defaultValue={model.releaseYear}
          />
        )}
      </Field>
      <Check name="isActive" label="Show this model" defaultChecked={model.isActive} />
      {error ? (
        <div className="md:col-span-2">
          <FormMessage>{error}</FormMessage>
        </div>
      ) : null}
      <Button type="submit" disabled={pending} className="min-h-11 md:col-span-2 md:w-fit">
        {pending ? "Saving…" : "Save model"}
      </Button>
    </form>
  );
}

export function AddOptionsForm({ model, hasStorage }: { model: Model; hasStorage: boolean }) {
  const { pending, error, submit } = useCatalogueForm();
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={formRef}
      className="grid gap-4 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const values = optionValues(new FormData(event.currentTarget));
        submit(
          () => addVariantsAction({ modelId: model.id, ...values }),
          "Options saved.",
          () => formRef.current?.reset(),
        );
      }}
    >
      <OptionFields hasStorage={hasStorage} />
      {error ? (
        <div className="md:col-span-2">
          <FormMessage>{error}</FormMessage>
        </div>
      ) : null}
      <Button
        type="submit"
        variant="outline"
        disabled={pending}
        className="min-h-11 md:col-span-2 md:w-fit"
      >
        {pending ? "Saving…" : "Add options"}
      </Button>
    </form>
  );
}

export function VariantRow({ variant }: { variant: Model["variants"][number] }) {
  const label = variantLabel(variant);
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
      <span className={variant.isActive ? undefined : "text-muted-foreground line-through"}>
        {label}
      </span>
      <ActionButton
        action={setVariantActiveAction}
        input={{ variantId: variant.id, isActive: !variant.isActive }}
        success={variant.isActive ? `${label} hidden.` : `${label} shown.`}
        variant="outline"
        size="sm"
      >
        {variant.isActive ? "Hide" : "Show"}
        <span className="sr-only"> {label}</span>
      </ActionButton>
    </li>
  );
}
