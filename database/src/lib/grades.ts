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
  /** What to expect, for the product page. Every grade works perfectly. */
  details: { screen: string; body: string };
};

export const GRADE_INFO: Record<Grade, GradeInfo> = {
  A: {
    grade: "A",
    label: "Excellent",
    description: "Looks almost new. No visible marks at arm's length.",
    details: {
      screen: "No visible scratches.",
      body: "May have tiny marks you’d only see up close.",
    },
  },
  B: {
    grade: "B",
    label: "Very good",
    description: "Light signs of use, such as small scuffs on the frame.",
    details: {
      screen: "Light scratches you can’t see when the screen is on.",
      body: "Small scuffs or marks on the frame or back.",
    },
  },
  C: {
    grade: "C",
    label: "Good",
    description: "Visible wear, such as scratches or dents. Fully working.",
    details: {
      screen: "Visible scratches, but no cracks.",
      body: "Noticeable scratches or small dents.",
    },
  },
};

export function isGrade(value: unknown): value is Grade {
  return typeof value === "string" && (GRADES as readonly string[]).includes(value);
}
