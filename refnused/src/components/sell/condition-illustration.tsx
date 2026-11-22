import { FingerprintIcon, ScanFaceIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Small illustration for a condition answer (option.illustration in the
 * database). Decorative: the option's text always carries the meaning.
 */
export function ConditionIllustration({
  name,
  className,
}: {
  name: string | null;
  className?: string;
}) {
  if (!name) return null;
  const [kind, level] = name.split("-") as [string, string];

  if (kind === "biometrics") {
    const ok = level === "ok";
    return (
      <span
        aria-hidden
        className={cn("relative inline-flex size-14 items-center justify-center", className)}
      >
        <ScanFaceIcon className={cn("size-9", ok ? "text-success" : "text-muted-foreground")} />
        <FingerprintIcon
          className={cn(
            "absolute right-0 bottom-0 size-5",
            ok ? "text-success" : "text-destructive",
          )}
        />
        {!ok ? (
          <span className="absolute top-1/2 left-1 h-0.5 w-12 -rotate-45 bg-destructive" />
        ) : null}
      </span>
    );
  }

  if (kind === "battery") {
    const fill = level === "good" ? 0.9 : level === "ok" ? 0.6 : 0.25;
    const colour =
      level === "good" ? "fill-success" : level === "ok" ? "fill-warning" : "fill-destructive";
    return (
      <svg viewBox="0 0 60 30" aria-hidden className={cn("h-10 w-20", className)}>
        <rect
          x="2"
          y="3"
          width="50"
          height="24"
          rx="5"
          className="fill-none stroke-foreground/70"
          strokeWidth="2.5"
        />
        <rect x="53" y="10" width="4" height="10" rx="1.5" className="fill-foreground/70" />
        <rect x="6" y="7" width={42 * fill} height="16" rx="2.5" className={colour} />
      </svg>
    );
  }

  // Phone front (screen, power) or back (body).
  const back = kind === "body";
  const screenOff = kind === "power" && level === "off";
  const marks: Record<string, string[]> = {
    light: ["M14 26 l8 -3", "M38 70 l6 2"],
    heavy: ["M12 22 l14 -6", "M30 40 l12 -8", "M16 60 l10 4", "M36 74 l10 -2", "M20 88 l12 -6"],
  };
  const crack = "M30 18 L24 40 L34 52 L22 72 L30 96 M24 40 L12 46 M34 52 L46 58";

  return (
    <svg viewBox="0 0 60 110" aria-hidden className={cn("h-16 w-9", className)}>
      <rect
        x="3"
        y="3"
        width="54"
        height="104"
        rx="10"
        className="fill-background stroke-foreground/70"
        strokeWidth="3"
      />
      {back ? (
        <rect
          x="9"
          y="9"
          width="20"
          height="20"
          rx="6"
          className="fill-muted stroke-foreground/50"
          strokeWidth="1.5"
        />
      ) : (
        <rect
          x="8"
          y="8"
          width="44"
          height="94"
          rx="6"
          className={screenOff || level === "cracked" ? "fill-foreground/80" : "fill-primary/15"}
        />
      )}
      {kind === "power" ? (
        <g
          className={level === "on" ? "stroke-success" : "stroke-background"}
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        >
          <path d="M30 44 v10" />
          <path d="M22 50 a10 10 0 1 0 16 0" />
        </g>
      ) : null}
      {marks[level]?.map((d) => (
        <path
          key={d}
          d={d}
          className="stroke-foreground/45"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
        />
      ))}
      {level === "cracked" || level === "damaged" ? (
        <path
          d={crack}
          className={back ? "stroke-foreground/70" : "stroke-background"}
          strokeWidth="1.5"
          fill="none"
        />
      ) : null}
      {level === "perfect" && !back ? (
        <path
          d="M14 30 L26 14"
          className="stroke-background"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.8"
        />
      ) : null}
    </svg>
  );
}
