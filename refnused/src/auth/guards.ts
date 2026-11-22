import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { CUSTOMER_SESSION_COOKIE } from "@/auth/cookies";
import { customerAuth } from "@/auth/customer";

/*
 * Customer guards. Staff guards live in the admin app (admin/src/auth/guards.ts).
 */

/** The signed-in customer, or a redirect to /sign-in. */
export async function requireCustomer(callbackUrl = "/account") {
  const session = await customerAuth();
  if (!session?.user?.id) {
    redirect(`/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }
  return session.user as typeof session.user & { id: string };
}

export async function hasCustomerSessionCookie() {
  return (await cookies()).has(CUSTOMER_SESSION_COOKIE);
}
