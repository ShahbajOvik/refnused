import { cn } from "@/lib/utils";

export function SectionHeading({
  id,
  eyebrow,
  title,
  intro,
  align = "left",
}: {
  id: string;
  eyebrow?: string;
  title: string;
  intro?: React.ReactNode;
  align?: "left" | "center";
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      {eyebrow ? <p className="text-sm font-medium text-primary">{eyebrow}</p> : null}
      <h2 id={id} className="mt-1 text-3xl font-semibold sm:text-4xl">
        {title}
      </h2>
      {intro ? <p className="mt-3 text-lg text-muted-foreground">{intro}</p> : null}
    </div>
  );
}
