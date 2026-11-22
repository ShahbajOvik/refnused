/** First focusable element on every page. Targets <main id="main-content">. */
export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only z-50 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
    >
      Skip to main content
    </a>
  );
}
