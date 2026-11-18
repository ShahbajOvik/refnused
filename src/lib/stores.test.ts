import { describe, expect, it } from "vitest";

import { formatOpeningHours, ukPhoneDisplay } from "./stores";

describe("formatOpeningHours", () => {
  it("groups days with the same hours", () => {
    const nine = { opens: "09:00", closes: "17:30" };
    expect(
      formatOpeningHours({
        mon: nine,
        tue: nine,
        wed: nine,
        thu: nine,
        fri: nine,
        sat: { opens: "10:00", closes: "16:00" },
        sun: null,
      }),
    ).toEqual([
      { days: "Mon–Fri", hours: "9am–5:30pm" },
      { days: "Sat", hours: "10am–4pm" },
      { days: "Sun", hours: "Closed" },
    ]);
  });

  it("returns null when hours aren't set", () => {
    expect(formatOpeningHours(null)).toBeNull();
  });
});

describe("ukPhoneDisplay", () => {
  it("formats UK numbers", () => {
    expect(ukPhoneDisplay("+441913800456")).toBe("0191 380 0456");
    expect(ukPhoneDisplay("+442071234567")).toBe("020 7123 4567");
    expect(ukPhoneDisplay("+447700900123")).toBe("07700 900123");
  });
});
