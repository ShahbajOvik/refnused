import { LogoMark } from "@/components/layout/logo";
import { siteConfig } from "@/config/site";

/** Minimal page frame for staff sign-in and 2FA pages. */
export function AdminAuthShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b bg-background">
        <div className="page-container flex h-16 items-center gap-2 font-semibold">
          <LogoMark className="size-7" />
          {siteConfig.name} <span className="font-normal text-muted-foreground">staff</span>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="flex-1 py-12 focus:outline-none">
        <div className="page-container">{children}</div>
      </main>
    </>
  );
}
