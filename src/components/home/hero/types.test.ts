import { describe, expect, it } from "vitest";

import { easeInOut } from "./types";

describe("easeInOut (matches GSAP power2.inOut)", () => {
  it.each([
    [0, 0],
    [0.25, 0.125],
    [0.5, 0.5],
    [0.75, 0.875],
    [1, 1],
  ])("%f → %f", (t, expected) => {
    expect(easeInOut(t)).toBeCloseTo(expected, 6);
  });

  it("clamps out-of-range progress", () => {
    expect(easeInOut(-1)).toBe(0);
    expect(easeInOut(2)).toBe(1);
  });
});
