import { staffHandlers } from "@/auth/staff";
import { withoutDirectEmailSignIn } from "@/lib/security/auth-routes";

export const GET = withoutDirectEmailSignIn(staffHandlers.GET);
export const POST = withoutDirectEmailSignIn(staffHandlers.POST);
