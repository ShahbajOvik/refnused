import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { SkipLink } from "@/components/layout/skip-link";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { LazyToaster } from "@/components/ui/lazy-toaster";
import { siteConfig } from "@refnused/database/config/site";
import { publicEnv } from "@refnused/database/lib/env";
import { THEME_INIT_SCRIPT } from "@refnused/database/lib/security/theme-script";

import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

/** Staff-only app: never indexed, never shown in search. */
export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.NEXT_PUBLIC_ADMIN_URL),
  title: { default: `${siteConfig.name} admin`, template: `%s | ${siteConfig.name} admin` },
  applicationName: `${siteConfig.name} admin`,
  robots: { index: false, follow: false, nocache: true },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1318" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-GB"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <head>
        {/* Allowed by hash in the strict CSP (THEME_SCRIPT_HASH). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <ThemeProvider>
          <SkipLink />
          {children}
          <LazyToaster position="bottom-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
