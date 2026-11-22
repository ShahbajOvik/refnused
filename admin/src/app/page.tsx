import { redirect } from "next/navigation";

/** The admin lives under /admin. */
export default function Home() {
  redirect("/admin");
}
