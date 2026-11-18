import type { OpeningHours } from "@/db/schema/stores";
import { DAYS, formatOpeningHours, formatTimeRange } from "@/lib/stores";

/** Grouped hours for cards: "Mon–Fri 9am–5:30pm". */
export function OpeningHoursSummary({ hours }: { hours: OpeningHours | null }) {
  const rows = formatOpeningHours(hours);
  if (!rows) return <p className="text-sm text-muted-foreground">Call for opening hours.</p>;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm">
      {rows.map((row) => (
        <div key={row.days} className="contents">
          <dt className="font-medium">{row.days}</dt>
          <dd className="text-muted-foreground">{row.hours}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Every day of the week, for the store page. */
export function OpeningHoursTable({ hours }: { hours: OpeningHours | null }) {
  if (!hours) return <p className="text-muted-foreground">Call the store for opening hours.</p>;
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Opening hours, UK time</caption>
      <tbody>
        {DAYS.map((day) => {
          const h = hours[day.key];
          return (
            <tr key={day.key} className="border-b last:border-0">
              <th scope="row" className="py-2 pr-4 text-left font-medium">
                {day.long}
              </th>
              <td className="py-2 text-right text-muted-foreground tabular-nums">
                {h ? formatTimeRange(h) : "Closed"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
