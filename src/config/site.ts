/**
 * Site-wide configuration: brand, navigation, stores and links.
 * This is the single source for store details. Do not hard-code them in
 * components. (May move to Sanity later; keep this shape.)
 */

export type Store = {
  /** URL-safe identifier, used for /stores/[slug]. */
  slug: string;
  name: string;
  address: {
    street: string;
    town: string;
    postcode: string;
  };
  /** E.164 format, used for tel: links and JSON-LD. */
  phone: string;
  /** Human-readable UK format. */
  phoneDisplay: string;
};

export type NavItem = {
  label: string;
  href: string;
  description?: string;
};

export const siteConfig = {
  name: "RefurbednUsed",
  tagline: "Sell your phone for cash. Buy refurbished with confidence.",
  description:
    "Get an instant quote for your used phone, or buy a graded refurbished phone with warranty. Visit our stores in North and South Shields.",
  locale: "en-GB",
  currency: "GBP",
} as const;

export const mainNav: NavItem[] = [
  { label: "Sell", href: "/sell", description: "Get an instant trade-in quote" },
  { label: "Shop", href: "/shop", description: "Refurbished phones with warranty" },
  { label: "Stores", href: "/stores", description: "Find a store near you" },
  { label: "Help", href: "/help", description: "FAQs, delivery and returns" },
];

export const stores: Store[] = [
  {
    slug: "metrotech-north-shields",
    name: "MetroTech",
    address: { street: "77A Rudyerd Street", town: "North Shields", postcode: "NE29 6RR" },
    phone: "+441913800456",
    phoneDisplay: "0191 380 0456",
  },
  {
    slug: "fairtech-south-shields",
    name: "FairTech",
    address: { street: "2 King St", town: "South Shields", postcode: "NE33 1HT" },
    phone: "+441914472311",
    phoneDisplay: "0191 447 2311",
  },
  // TODO: add Store 3 once details are confirmed.
];

export const legalNav: NavItem[] = [
  { label: "Terms and conditions", href: "/terms" },
  { label: "Privacy policy", href: "/privacy" },
  { label: "Cookie policy", href: "/cookies" },
  { label: "Returns and refunds", href: "/returns" },
  { label: "Warranty", href: "/warranty" },
  { label: "Accessibility", href: "/accessibility" },
];

export type SocialLink = {
  label: string;
  href: string;
};

// TODO: replace with the real RefurbednUsed profile URLs.
export const socialLinks: SocialLink[] = [
  { label: "Facebook", href: "https://www.facebook.com/" },
  { label: "Instagram", href: "https://www.instagram.com/" },
  { label: "TikTok", href: "https://www.tiktok.com/" },
  { label: "X", href: "https://x.com/" },
];
