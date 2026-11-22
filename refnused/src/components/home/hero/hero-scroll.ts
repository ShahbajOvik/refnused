import type { HeroMotionState } from "./types";

/**
 * Scroll-driven split (GSAP ScrollTrigger). As the hero scrolls, the phone
 * splits in two and each half moves over its path card: "Sell your phone"
 * on the left, "Buy refurbished" on the right.
 *
 * Drives the static posters directly and writes `state` for the 3D scene.
 * GSAP is imported here, lazily, so it never adds to the initial bundle.
 * Returns a cleanup function.
 */
export async function setupHeroScroll(stage: HTMLElement, state: HeroMotionState) {
  const [{ gsap }, { ScrollTrigger }] = await Promise.all([
    import("gsap"),
    import("gsap/ScrollTrigger"),
  ]);
  gsap.registerPlugin(ScrollTrigger);
  // Don't recalculate when mobile browser toolbars show or hide.
  ScrollTrigger.config({ ignoreMobileResize: true });

  const section = stage.closest<HTMLElement>("[data-hero]");
  const sellCard = section?.querySelector<HTMLElement>('[data-hero-path="sell"]');
  if (!section || !sellCard) return () => {};

  /** Pixels from the stage centre to the centre of the "Sell" card. */
  const spreadPx = () => {
    const s = stage.getBoundingClientRect();
    const c = sellCard.getBoundingClientRect();
    return Math.max(s.width * 0.18, s.left + s.width / 2 - (c.left + c.width / 2));
  };
  const updateSpread = () => {
    state.spread = spreadPx() / Math.max(1, stage.getBoundingClientRect().width);
  };
  updateSpread();

  const ctx = gsap.context(() => {
    gsap
      .timeline({
        defaults: { ease: "power2.inOut" },
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.6,
          invalidateOnRefresh: true,
          onRefresh: updateSpread,
          onUpdate: (self) => {
            state.progress = self.progress;
          },
        },
      })
      .to("[data-hero-poster='a']", { x: () => -spreadPx(), scale: 0.78, rotate: -4 }, 0)
      .fromTo(
        "[data-hero-poster='b']",
        { autoAlpha: 0 },
        { autoAlpha: 1, duration: 0.08, ease: "none" },
        0,
      )
      .fromTo(
        "[data-hero-poster='b']",
        { x: 0, scale: 1, rotate: 0 },
        { x: () => spreadPx(), scale: 0.78, rotate: 4 },
        0,
      )
      .to("[data-hero-intro]", { y: -20, opacity: 0.8 }, 0)
      .fromTo("[data-hero-path]", { y: 0, scale: 1 }, { y: -8, scale: 1.03, stagger: 0.06 }, 0.35);
  }, section);

  return () => ctx.revert();
}
