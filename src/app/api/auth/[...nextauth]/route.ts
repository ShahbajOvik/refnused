import { customerHandlers } from "@/auth/customer";
import { withoutDirectEmailSignIn } from "@/lib/security/auth-routes";

export const GET = withoutDirectEmailSignIn(customerHandlers.GET);
export const POST = withoutDirectEmailSignIn(customerHandlers.POST);
