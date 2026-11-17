/**
 * Condition grades for refurbished phones.
 * Single source of truth for labels and descriptions shown to customers.
 */
export const GRADES = ["A", "B", "C"] as const;

export type Grade = (typeof GRADES)[number];

export type GradeInfo = {
  grade: Grade;
  /** Short customer-facing label, e.g. "Excellent". */
  label: string;
  /** One-line explanation of the cosmetic condition. */
  description: string;
};

export const GRADE_INFO: Record<Grade, GradeInfo> = {
  A: {
    grade: "A",
    label: "Excellent",
    description: "Looks almost new. No visible marks at arm's length.",
  },
  B: {
    grade: "B",
    label: "Very good",
    description: "Light signs of use, such as small scuffs on the frame.",
  },
  C: {
    grade: "C",
    label: "Good",
    description: "Visible wear, such as scratches or dents. Fully working.",
  },
};

export function isGrade(value: unknown): value is Grade {
  return typeof value === "string" && (GRADES as readonly string[]).includes(value);
}
