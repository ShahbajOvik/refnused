import type { MetadataRoute } from "next";

import { siteConfig } from "@refnused/database/config/site";

/*
 * Web app manifest (/manifest.webmanifest). Icons and screenshots are made
 * by `npm run pwa:assets` (scripts/render-pwa-assets.mts).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: siteConfig.name,
    short_name: siteConfig.name,
    description: siteConfig.description,
    lang: "en-GB",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    background_color: "#ffffff",
    theme_color: "#ffffff",
    categories: ["shopping", "business"],
    prefer_related_applications: false,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    screenshots: [
      {
        src: "/screenshots/home-narrow.png",
        sizes: "1080x1920",
        type: "image/png",
        form_factor: "narrow",
        label: "Sell your phone for cash or buy refurbished",
      },
      {
        src: "/screenshots/shop-narrow.png",
        sizes: "1080x1920",
        type: "image/png",
        form_factor: "narrow",
        label: "Refurbished phones with grades and a warranty",
      },
      {
        src: "/screenshots/home-wide.png",
        sizes: "1920x1080",
        type: "image/png",
        form_factor: "wide",
        label: "Instant trade-in quotes and refurbished phones",
      },
    ],
    shortcuts: [
      {
        name: "Sell your phone",
        short_name: "Sell",
        description: "Get an instant trade-in quote",
        url: "/sell",
        icons: [{ src: "/icons/shortcut-sell.png", sizes: "96x96", type: "image/png" }],
      },
      {
        name: "Shop refurbished phones",
        short_name: "Shop",
        description: "Graded refurbished phones with warranty",
        url: "/shop",
        icons: [{ src: "/icons/shortcut-shop.png", sizes: "96x96", type: "image/png" }],
      },
      {
        name: "Find a store",
        short_name: "Stores",
        description: "Our stores in North and South Shields",
        url: "/stores",
        icons: [{ src: "/icons/shortcut-stores.png", sizes: "96x96", type: "image/png" }],
      },
      {
        name: "Your account",
        short_name: "Account",
        description: "Quotes, orders and price alerts",
        url: "/account",
        icons: [{ src: "/icons/shortcut-account.png", sizes: "96x96", type: "image/png" }],
      },
    ],
  };
}
