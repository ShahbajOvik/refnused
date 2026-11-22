import { MapPinIcon, PhoneIcon } from "lucide-react";
import { cacheLife } from "next/cache";
import Link from "next/link";

import { Logo } from "@/components/layout/logo";
import { StoreAddress } from "@/components/stores/store-actions";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import {
  footerExtraNav,
  legalNav,
  mainNav,
  siteConfig,
  socialLinks,
} from "@refnused/database/config/site";
import { telHref } from "@refnused/database/lib/format";
import { storeName, storePath } from "@refnused/database/lib/stores";
import { loadPublicStores } from "@/lib/stores-cache";

const linkClass =
  "rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

async function getCurrentYear() {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}

export async function SiteFooter() {
  const [year, stores] = await Promise.all([getCurrentYear(), loadPublicStores()]);

  return (
    <footer className="mt-auto border-t bg-muted/40 text-sm">
      <div className="page-container grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-4">
          <Logo />
          <p className="max-w-xs text-muted-foreground">{siteConfig.tagline}</p>
          <ul aria-label="Social media" className="flex flex-wrap gap-2">
            {socialLinks.map((link) => (
              <li key={link.label}>
                <a
                  href={link.href}
                  rel="noopener noreferrer"
                  target="_blank"
                  className="inline-flex min-h-9 items-center rounded-full border bg-background px-3 font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {link.label}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="lg:col-span-2">
          <h2 className="mb-4 text-base font-semibold">Our stores</h2>
          <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {stores.map((store) => (
              <li key={store.slug}>
                <p className="font-medium">
                  <Link href={storePath(store)} className={linkClass}>
                    {storeName(store)}
                  </Link>
                </p>
                <div className="mt-1 flex gap-2 text-muted-foreground">
                  <MapPinIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <StoreAddress store={store} className="not-italic" />
                </div>
                <a
                  href={telHref(store.phone)}
                  className={`mt-1 inline-flex min-h-9 items-center gap-2 font-medium text-primary ${linkClass}`}
                >
                  <PhoneIcon className="size-4" aria-hidden />
                  {store.phoneDisplay}
                  <span className="sr-only"> (call {storeName(store)})</span>
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-2 gap-6 sm:col-span-2 lg:col-span-1 lg:grid-cols-1">
          <nav aria-label="Footer">
            <h2 className="mb-4 text-base font-semibold">Explore</h2>
            <ul className="flex flex-col gap-2 text-muted-foreground">
              {[...mainNav, ...footerExtraNav].map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={linkClass}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Legal">
            <h2 className="mb-4 text-base font-semibold">Legal</h2>
            <ul className="flex flex-col gap-2 text-muted-foreground">
              {legalNav.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={linkClass}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>

      <div className="border-t">
        <div className="page-container flex flex-col items-start justify-between gap-2 py-4 text-muted-foreground sm:flex-row sm:items-center">
          <p>
            © {year} {siteConfig.name}. All prices in GBP.
          </p>
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}
