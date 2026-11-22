import "server-only";

/** Runs a read; on failure logs it and returns the fallback (never cached). */
export async function orFallback<T>(
  label: string,
  read: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await read();
  } catch (error) {
    console.error(`[shop] ${label} failed`, error);
    return fallback;
  }
}
