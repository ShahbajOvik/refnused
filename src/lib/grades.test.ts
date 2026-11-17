import { describe, expect, it } from "vitest";

import { GRADE_INFO, GRADES, isGrade } from "@/lib/grades";

describe("grades", () => {
  it("defines info for every grade", () => {
    for (const grade of GRADES) {
      expect(GRADE_INFO[grade].grade).toBe(grade);
      expect(GRADE_INFO[grade].label).not.toBe("");
    }
  });

  it("isGrade accepts only A, B and C", () => {
    expect(isGrade("A")).toBe(true);
    expect(isGrade("C")).toBe(true);
    expect(isGrade("a")).toBe(false);
    expect(isGrade("D")).toBe(false);
    expect(isGrade(undefined)).toBe(false);
  });
});
