"use client";

import { useId, useState } from "react";

import { useAdminAction } from "@/app/admin/_components/action-button";
import { FileUploader, type UploadedFile } from "@/app/admin/_components/file-uploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPrice } from "@/lib/format";

import { recordInspectionAction } from "../actions";

const GRADES = [
  ["A", "A · Excellent"],
  ["B", "B · Very good"],
  ["C", "C · Good"],
  ["faulty", "Faulty"],
] as const;

const CHECKMEND = [
  ["clear", "Clear"],
  ["lost_or_stolen", "Lost or stolen"],
  ["blocked", "Blocked"],
  ["finance_outstanding", "Finance outstanding"],
  ["insurance_claim", "Insurance claim"],
  ["error", "Couldn’t check (try again later)"],
] as const;

const OUTCOME = {
  approved: "Approved: ready to pay.",
  revised: "Revised offer sent to the customer.",
  rejected: "Rejected: the customer has been emailed.",
  pending_check: "Saved. Check CheckMEND again before deciding.",
};

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export function InspectionForm({
  quoteId,
  device,
  offeredPence,
  gradePrices,
  quotedGrade,
}: {
  quoteId: string;
  device: string;
  offeredPence: number;
  gradePrices: Partial<Record<string, number>>;
  quotedGrade: string;
}) {
  const id = useId();
  const { pending, run } = useAdminAction();
  const [grade, setGrade] = useState(quotedGrade);
  const [checkmend, setCheckmend] = useState("clear");
  const [photos, setPhotos] = useState<UploadedFile[]>([]);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const suggestion = gradePrices[grade];

  return (
    <form
      noValidate
      className="grid gap-5 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        run(
          () =>
            recordInspectionAction({
              quoteId,
              actualGrade: grade as "A",
              checkmendResult: checkmend as "clear",
              checkmendReference: String(data.get("checkmendReference") ?? ""),
              notes: String(data.get("notes") ?? ""),
              revisedPounds: String(data.get("revisedPounds") ?? ""),
              photos: photos.map((p) => ({ key: p.key, alt: p.alt })),
            }),
          {
            success: (outcome) => OUTCOME[outcome],
            onSuccess: () => setErrors({}),
            onError: (r) => setErrors(r.fieldErrors ?? {}),
          },
        );
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-grade`} className="text-sm font-medium">
          Actual grade
        </label>
        <select
          id={`${id}-grade`}
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
          className={selectClass}
        >
          {GRADES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Customer said grade {quotedGrade === "faulty" ? "faulty" : quotedGrade}.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-checkmend`} className="text-sm font-medium">
          CheckMEND result
        </label>
        <select
          id={`${id}-checkmend`}
          value={checkmend}
          onChange={(e) => setCheckmend(e.target.value)}
          className={selectClass}
        >
          {CHECKMEND.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-ref`} className="text-sm font-medium">
          CheckMEND certificate number (optional)
        </label>
        <Input id={`${id}-ref`} name="checkmendReference" autoComplete="off" />
      </div>
      {checkmend === "clear" ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-revised`} className="text-sm font-medium">
            Revised offer (£, optional)
          </label>
          <Input
            id={`${id}-revised`}
            name="revisedPounds"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            aria-describedby={`${id}-revised-hint`}
            aria-invalid={errors.revisedPounds ? true : undefined}
          />
          <p id={`${id}-revised-hint`} className="text-xs text-muted-foreground">
            Leave empty to pay the original {formatPrice(offeredPence)}.
            {suggestion !== undefined
              ? ` Our price for grade ${grade === "faulty" ? "faulty" : grade}: ${formatPrice(suggestion)}.`
              : ""}
          </p>
        </div>
      ) : (
        <p className="self-end text-sm text-muted-foreground">
          {checkmend === "error"
            ? "No decision is made until CheckMEND can be checked."
            : "The quote will be rejected and the payout cancelled."}
        </p>
      )}
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <label htmlFor={`${id}-notes`} className="text-sm font-medium">
          Notes (sent to the customer with a revised offer)
        </label>
        <textarea
          id={`${id}-notes`}
          name="notes"
          rows={3}
          maxLength={2000}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        />
      </div>
      <div className="sm:col-span-2">
        <p className="mb-2 text-sm font-medium">Photos</p>
        <FileUploader
          kind="inspection-photo"
          label="Add photos"
          multiple
          value={photos}
          onChange={setPhotos}
          altPrefix={`${device} inspection photo`}
        />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending} className="min-h-11">
          {pending ? "Saving…" : "Save inspection"}
        </Button>
      </div>
    </form>
  );
}
