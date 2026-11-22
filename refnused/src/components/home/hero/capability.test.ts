import { describe, expect, it } from "vitest";

import { chooseHeroMode, type DeviceSignals } from "./capability";

const capable: DeviceSignals = {
  reducedMotion: false,
  saveData: false,
  effectiveType: "4g",
  hardwareConcurrency: 8,
  deviceMemory: 8,
  webgl: "hardware",
};

describe("chooseHeroMode", () => {
  it("uses 3D on capable devices", () => {
    expect(chooseHeroMode(capable)).toBe("3d");
  });

  it("uses 3D when optional hints are missing (Safari, Firefox)", () => {
    expect(chooseHeroMode({ ...capable, effectiveType: undefined, deviceMemory: undefined })).toBe(
      "3d",
    );
  });

  it.each<[string, Partial<DeviceSignals>]>([
    ["prefers-reduced-motion", { reducedMotion: true }],
    ["Save-Data", { saveData: true }],
    ["slow network", { effectiveType: "3g" }],
    ["2G", { effectiveType: "2g" }],
    ["few CPU cores", { hardwareConcurrency: 2 }],
    ["low memory", { deviceMemory: 2 }],
    ["no WebGL", { webgl: "none" }],
    ["software WebGL", { webgl: "software" }],
  ])("uses the static image for %s", (_, override) => {
    expect(chooseHeroMode({ ...capable, ...override })).toBe("static");
  });

  it("can be forced on for testing, but never against user preferences", () => {
    expect(chooseHeroMode({ ...capable, webgl: "software" }, { force3d: true })).toBe("3d");
    expect(chooseHeroMode({ ...capable, reducedMotion: true }, { force3d: true })).toBe("static");
    expect(chooseHeroMode({ ...capable, saveData: true }, { force3d: true })).toBe("static");
    expect(chooseHeroMode({ ...capable, webgl: "none" }, { force3d: true })).toBe("static");
  });
});
