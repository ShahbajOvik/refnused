import { staffHandlers } from "@/auth/staff";
import { withoutDirectEmailSignIn } from "@refnused/database/lib/security/auth-routes";

export const GET = withoutDirectEmailSignIn(staffHandlers.GET);
export const POST = withoutDirectEmailSignIn(staffHandlers.POST);
