import type { z } from "zod";

/** Zod issues keyed by dotted path ("bank.sortCode"), for nested fields. */
export function fieldErrorsByPath(error: z.ZodError) {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".");
    (errors[path] ??= []).push(issue.message);
  }
  return errors;
}
