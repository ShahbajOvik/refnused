/** Midnight in London (as a UTC instant) for the day containing `now`, minus `daysAgo` days. */
export function startOfLondonDay(now: Date, daysAgo = 0): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const wall = Date.UTC(
    +parts.year!,
    +parts.month! - 1,
    +parts.day!,
    +parts.hour!,
    +parts.minute!,
    +parts.second!,
  );
  const offset = wall - Math.floor(now.getTime() / 1000) * 1000;
  const midnightWall = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day! - daysAgo);
  return new Date(midnightWall - offset);
}
