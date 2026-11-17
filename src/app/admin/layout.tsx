import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | RefurbednUsed admin" },
  robots: { index: false, follow: false, nocache: true },
};

/** Admin area: no public header/footer, never indexed. */
export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return <div className="flex min-h-dvh flex-col bg-muted/30">{children}</div>;
}
