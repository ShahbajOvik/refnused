/** Only allow same-site relative callback URLs (prevents open redirects). */
export function safeCallbackUrl(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }
  if (value.includes("\\")) return fallback;
  // Browsers drop tabs and newlines from URLs, so "/\t/evil.example" would
  // become "//evil.example" (another site). Refuse any control or space character.
  if (/[\u0000-\u0020\u007f-\u009f\u2028\u2029]/.test(value)) return fallback;
  return value;
}
