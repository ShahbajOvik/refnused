import type { Store } from "@/config/site";
import type { DayOfWeek, OpeningHours } from "@/db/schema/stores";

/*
 * Stores, from the database (edited in /admin/stores). src/config/site.ts
 * only seeds them. Pure helpers here are safe to use anywhere.
 */

export type PublicStore = Store & {
  openingHours: OpeningHours | null;
  latitude: number | null;
  longitude: number | null;
};

export const DAYS: { key: DayOfWeek; short: string; long: string; schema: string }[] = [
  { key: "mon", short: "Mon", long: "Monday", schema: "Monday" },
  { key: "tue", short: "Tue", long: "Tuesday", schema: "Tuesday" },
  { key: "wed", short: "Wed", long: "Wednesday", schema: "Wednesday" },
  { key: "thu", short: "Thu", long: "Thursday", schema: "Thursday" },
  { key: "fri", short: "Fri", long: "Friday", schema: "Friday" },
  { key: "sat", short: "Sat", long: "Saturday", schema: "Saturday" },
  { key: "sun", short: "Sun", long: "Sunday", schema: "Sunday" },
];

/** +441913800456 → "0191 380 0456"; mobiles 07xxx xxxxxx. */
export function ukPhoneDisplay(e164: string): string {
  if (!e164.startsWith("+44")) return e164;
  const national = `0${e164.slice(3)}`;
  if (/^01\d1/.test(national) || /^011/.test(national)) {
    return `${national.slice(0, 4)} ${national.slice(4, 7)} ${national.slice(7)}`;
  }
  if (/^02/.test(national))
    return `${national.slice(0, 3)} ${national.slice(3, 7)} ${national.slice(7)}`;
  return `${national.slice(0, 5)} ${national.slice(5)}`;
}

/** "09:00" → "9am", "17:30" → "5:30pm" (UK style). */
function time12(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour}:${String(m).padStart(2, "0")}${suffix}` : `${hour}${suffix}`;
}

/**
 * Groups days with the same hours: "Mon–Fri 9am–5:30pm", "Sat 9am–5pm",
 * "Sun Closed". Null when the hours aren't set.
 */
export function formatOpeningHours(
  hours: OpeningHours | null,
): { days: string; hours: string }[] | null {
  if (!hours) return null;
  const label = (key: DayOfWeek) => {
    const h = hours[key];
    return h ? `${time12(h.opens)}–${time12(h.closes)}` : "Closed";
  };
  const groups: { from: number; to: number; text: string }[] = [];
  DAYS.forEach((day, index) => {
    const text = label(day.key);
    const last = groups.at(-1);
    if (last && last.text === text && last.to === index - 1) last.to = index;
    else groups.push({ from: index, to: index, text });
  });
  return groups.map((g) => ({
    days: g.from === g.to ? DAYS[g.from]!.short : `${DAYS[g.from]!.short}–${DAYS[g.to]!.short}`,
    hours: g.text,
  }));
}
