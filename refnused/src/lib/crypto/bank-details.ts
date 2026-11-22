import "server-only";

import { z } from "zod";

import { getFieldCipher, type FieldCipher } from "./field-encryption";

/** UK bank details as entered by a customer for a trade-in payout. */
export const bankDetailsSchema = z.object({
  accountHolderName: z
    .string()
    .trim()
    .min(1, "Enter the name on the account")
    .max(70, "Name must be 70 characters or fewer"),
  sortCode: z
    .string()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^\d{6}$/, "Enter a 6-digit sort code, like 12-34-56")),
  accountNumber: z
    .string()
    .transform((v) => v.replace(/\s/g, ""))
    .pipe(z.string().regex(/^\d{8}$/, "Enter an 8-digit account number")),
});

export type BankDetailsInput = z.input<typeof bankDetailsSchema>;
export type BankDetails = z.output<typeof bankDetailsSchema>;

/** Matches the encrypted columns on the payouts table. */
export type EncryptedBankDetails = {
  accountHolderNameEncrypted: string;
  sortCodeEncrypted: string;
  accountNumberEncrypted: string;
  accountNumberLast4: string;
};

// Each field is bound to its column, so values can't be swapped between them.
const CONTEXT = {
  accountHolderName: "payouts.account_holder_name",
  sortCode: "payouts.sort_code",
  accountNumber: "payouts.account_number",
} as const;

/** Validates, normalises and encrypts bank details for storage. */
export function encryptBankDetails(
  input: BankDetailsInput,
  cipher: FieldCipher = getFieldCipher(),
): EncryptedBankDetails {
  const details = bankDetailsSchema.parse(input);
  return {
    accountHolderNameEncrypted: cipher.encrypt(
      details.accountHolderName,
      CONTEXT.accountHolderName,
    ),
    sortCodeEncrypted: cipher.encrypt(details.sortCode, CONTEXT.sortCode),
    accountNumberEncrypted: cipher.encrypt(details.accountNumber, CONTEXT.accountNumber),
    accountNumberLast4: details.accountNumber.slice(-4),
  };
}

/**
 * Decrypts bank details. Only call this where the plain values are needed
 * (sending a payment) and never log the result.
 */
export function decryptBankDetails(
  row: Omit<EncryptedBankDetails, "accountNumberLast4">,
  cipher: FieldCipher = getFieldCipher(),
): BankDetails {
  return {
    accountHolderName: cipher.decrypt(row.accountHolderNameEncrypted, CONTEXT.accountHolderName),
    sortCode: cipher.decrypt(row.sortCodeEncrypted, CONTEXT.sortCode),
    accountNumber: cipher.decrypt(row.accountNumberEncrypted, CONTEXT.accountNumber),
  };
}

/** "Account ending 1234" style display, safe to show anywhere. */
export function describeBankAccount(last4: string): string {
  return `Account ending ${last4}`;
}
