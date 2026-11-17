import { Reveal } from "@/components/motion/reveal";
import { GradeBadge } from "@/components/ui/badge";
import { GRADE_INFO, GRADES } from "@/lib/grades";
import { cn } from "@/lib/utils";

import { SectionHeading } from "./section-heading";

// Visual hint of wear: more marks for lower grades (decorative).
const scuffs = { A: 0, B: 2, C: 5 } as const;

export function GradingExplainer() {
  return (
    <section
      aria-labelledby="grading-heading"
      className="border-y bg-muted/40 py-(--spacing-section)"
    >
      <div className="page-container">
        <SectionHeading
          id="grading-heading"
          eyebrow="Grading"
          title="Grades describe looks, not how it works"
          intro="Every refurbished phone is fully tested before it’s listed. The grade tells you about cosmetic condition, so you can choose the price that suits you."
        />
        <ul className="mt-10 grid gap-6 md:grid-cols-3">
          {GRADES.map((grade, index) => (
            <Reveal
              as="li"
              key={grade}
              delay={index * 0.1}
              className="rounded-2xl border bg-card p-6"
            >
              <div
                aria-hidden
                className={cn(
                  "relative mx-auto mb-6 h-32 w-16 rounded-xl border-4 border-foreground/70 bg-gradient-to-b from-muted to-background",
                )}
              >
                {Array.from({ length: scuffs[grade] }, (_, i) => (
                  <span
                    key={i}
                    className="absolute h-px bg-foreground/40"
                    style={{
                      top: `${15 + i * 15}%`,
                      left: `${10 + ((i * 37) % 50)}%`,
                      width: `${20 + ((i * 13) % 25)}%`,
                      transform: `rotate(${-20 + i * 9}deg)`,
                    }}
                  />
                ))}
              </div>
              <GradeBadge grade={grade} />
              <p className="mt-3 text-muted-foreground">{GRADE_INFO[grade].description}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
