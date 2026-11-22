import { z } from "zod";

/** Luhn checksum (used by IMEIs). */
export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** Appends the Luhn check digit to a 14-digit IMEI body. */
export function withImeiCheckDigit(body14: string): string {
  for (let check = 0; check <= 9; check++) {
    if (luhnValid(body14 + check)) return body14 + check;
  }
  throw new Error("unreachable");
}

export function isValidImei(value: string): boolean {
  return /^\d{15}$/.test(value) && luhnValid(value);
}

export const imeiSchema = z
  .string()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .pipe(
    z
      .string()
      .regex(/^\d{15}$/, "An IMEI is 15 digits. Dial *#06# to see it.")
      .refine(luhnValid, "That IMEI isn’t valid. Check the digits (dial *#06# to see it)."),
  );

const POSTCODE = /^([A-Z]{1,2}\d[A-Z\d]?) ?(\d[A-Z]{2})$/;

/** "ne296rr" → "NE29 6RR", or null if not a UK postcode. */
export function normaliseUkPostcode(value: string): string | null {
  const match = value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/);
  return match ? `${match[1]} ${match[2]}` : null;
}

export const ukPostcodeSchema = z.string().transform((v, ctx) => {
  const postcode = normaliseUkPostcode(v);
  if (!postcode || !POSTCODE.test(postcode)) {
    ctx.addIssue({ code: "custom", message: "Enter a full UK postcode, like NE29 6RR" });
    return z.NEVER;
  }
  return postcode;
});

/** UK mobile or landline → E.164 (+44…), or null. */
export function normaliseUkPhone(value: string): string | null {
  const digits = value.replace(/[\s()-]/g, "");
  const national = digits.startsWith("+44")
    ? digits.slice(3)
    : digits.startsWith("0044")
      ? digits.slice(4)
      : digits.startsWith("0")
        ? digits.slice(1)
        : null;
  if (national === null || !/^[1-37]\d{8,9}$/.test(national)) return null;
  return `+44${national}`;
}

export const ukPhoneSchema = z.string().transform((v, ctx) => {
  const phone = normaliseUkPhone(v);
  if (!phone) {
    ctx.addIssue({ code: "custom", message: "Enter a UK phone number, like 07700 900123" });
    return z.NEVER;
  }
  return phone;
});

export function isUkMobile(e164: string): boolean {
  return /^\+447\d{9}$/.test(e164);
}
