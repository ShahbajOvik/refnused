import type { Store } from "@/config/site";
import type { DayOfWeek, OpeningHours, StorePhoto } from "@/db/schema/stores";

/*
 * Stores, from the database (edited in /admin/stores). src/config/site.ts
 * only seeds them. Pure helpers here are safe to use anywhere.
 */

export type PublicStore = Store & {
  email: string | null;
  openingHours: OpeningHours | null;
  latitude: number | null;
  longitude: number | null;
  parkingInfo: string | null;
  nearestMetro: string | null;
  photos: StorePhoto[];
};

/*
 * NAP (name, address, phone). Every place that shows a store, including
 * the footer, store cards, store pages and JSON-LD, uses these so the
 * details are always written exactly the same way.
 */

/** "FairTech, North Shields" */
export function storeName(store: { name: string; address: { town: string } }): string {
  return `${store.name}, ${store.address.town}`;
}

/** ["20B Saville Street (West)", "North Shields NE29 6QR"] */
export function storeAddressLines(store: Pick<Store, "address">): [string, string] {
  return [store.address.street, `${store.address.town} ${store.address.postcode}`];
}

/** "20B Saville Street (West), North Shields NE29 6QR" */
export function storeAddress(store: Pick<Store, "address">): string {
  return storeAddressLines(store).join(", ");
}

export function storePath(store: Pick<Store, "slug">): string {
  return `/stores/${store.slug}`;
}

/** Google Maps directions from the visitor's location. */
export function storeDirectionsUrl(store: Pick<Store, "name" | "address">): string {
  const destination = `${store.name}, ${storeAddress(store)}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

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

/** { opens: "09:00", closes: "17:30" } → "9am–5:30pm" */
export function formatTimeRange(h: { opens: string; closes: string }): string {
  return `${time12(h.opens)}–${time12(h.closes)}`;
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
    return h ? formatTimeRange(h) : "Closed";
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

const WEEKDAY_KEYS: Record<string, DayOfWeek> = {
  Mon: "mon",
  Tue: "tue",
  Wed: "wed",
  Thu: "thu",
  Fri: "fri",
  Sat: "sat",
  Sun: "sun",
};

const londonParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Day and minutes since midnight in UK time (handles BST). */
export function londonClock(now: Date): { day: DayOfWeek; minutes: number } {
  const parts = Object.fromEntries(londonParts.formatToParts(now).map((p) => [p.type, p.value]));
  return {
    day: WEEKDAY_KEYS[parts.weekday!]!,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
};

export type OpenStatus = { open: boolean; text: string };

/**
 * "Open now · closes 5:30pm", "Closing soon · closes 5:30pm",
 * "Closed · opens 9am", "Closed · opens tomorrow at 9am",
 * "Closed · opens Monday at 10am". Null when hours aren't set.
 */
export function openStatus(hours: OpeningHours | null, now: Date): OpenStatus | null {
  if (!hours) return null;
  const { day, minutes } = londonClock(now);
  const today = hours[day];
  if (today) {
    const opens = toMinutes(today.opens);
    const closes = toMinutes(today.closes);
    if (minutes >= opens && minutes < closes) {
      const soon = closes - minutes <= 30;
      return {
        open: true,
        text: `${soon ? "Closing soon" : "Open now"} · closes ${time12(today.closes)}`,
      };
    }
    if (minutes < opens) return { open: false, text: `Closed · opens ${time12(today.opens)}` };
  }
  const start = DAYS.findIndex((d) => d.key === day);
  for (let ahead = 1; ahead <= 7; ahead++) {
    const next = DAYS[(start + ahead) % 7]!;
    const h = hours[next.key];
    if (!h) continue;
    const when = ahead === 1 ? "tomorrow" : next.long;
    return { open: false, text: `Closed · opens ${when} at ${time12(h.opens)}` };
  }
  return { open: false, text: "Closed" };
}
