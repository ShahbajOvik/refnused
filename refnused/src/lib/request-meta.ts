import "server-only";

import { headers } from "next/headers";

import type { RequestMeta } from "@/lib/audit";

/** IP and user agent of the current request, for audit entries. */
export async function getRequestMeta(): Promise<RequestMeta> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
    return {
      ipAddress: forwarded || h.get("x-real-ip") || null,
      userAgent: h.get("user-agent"),
    };
  } catch {
    // Outside a request (scripts, tests).
    return {};
  }
}
