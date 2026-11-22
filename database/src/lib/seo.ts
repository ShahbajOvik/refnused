import { siteConfig } from "../config/site";
import { publicEnv } from "./env";
import { mediaUrl } from "./media";
import {
  DAYS,
  type PublicStore,
  storeAddressLines,
  storeDirectionsUrl,
  storeName,
  storePath,
} from "./stores";

/** Absolute URL for canonical links, Open Graph and JSON-LD. */
export function absoluteUrl(path = "/"): string {
  return new URL(path, publicEnv.NEXT_PUBLIC_SITE_URL).toString();
}

export const ORGANIZATION_ID = "/#organization";
export const WEBSITE_ID = "/#website";

/**
 * The business. Stores are linked as departments by @id, so their full
 * details (from storeJsonLd) are only written once per page.
 */
export function organizationJsonLd(stores: Pick<PublicStore, "slug">[] = []) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": absoluteUrl(ORGANIZATION_ID),
    name: siteConfig.name,
    url: absoluteUrl("/"),
    logo: absoluteUrl("/icon.svg"),
    description: siteConfig.description,
    areaServed: "GB",
    ...(stores.length
      ? { department: stores.map((s) => ({ "@id": absoluteUrl(`${storePath(s)}#store`) })) }
      : {}),
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": absoluteUrl(WEBSITE_ID),
    name: siteConfig.name,
    url: absoluteUrl("/"),
    inLanguage: siteConfig.locale,
    publisher: { "@id": absoluteUrl(ORGANIZATION_ID) },
  };
}

export type FaqItem = { question: string; answer: string };

/** FAQPage. Only for questions shown on the same page, word for word. */
export function faqPageJsonLd(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

export type ArticleJsonLdInput = {
  path: string;
  headline: string;
  description: string;
  author:
    { kind: "person"; name: string; role: string | null } | { kind: "organization"; name: string };
  /** ISO 8601. */
  publishedAt: string;
  updatedAt: string;
  /** Absolute or site-relative. */
  images: string[];
  /** Things the article is about, e.g. "Apple iPhone 15". */
  about?: string[];
};

export function articleJsonLd(input: ArticleJsonLdInput) {
  const url = absoluteUrl(input.path);
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${url}#article`,
    headline: input.headline.slice(0, 110),
    description: input.description,
    url,
    mainEntityOfPage: url,
    inLanguage: siteConfig.locale,
    datePublished: input.publishedAt,
    dateModified: input.updatedAt,
    author:
      input.author.kind === "person"
        ? {
            "@type": "Person",
            name: input.author.name,
            ...(input.author.role ? { jobTitle: input.author.role } : {}),
            worksFor: { "@id": absoluteUrl(ORGANIZATION_ID) },
          }
        : { "@type": "Organization", "@id": absoluteUrl(ORGANIZATION_ID), name: input.author.name },
    publisher: { "@id": absoluteUrl(ORGANIZATION_ID) },
    isPartOf: { "@id": absoluteUrl(WEBSITE_ID) },
    image: input.images.map((src) => absoluteUrl(src)),
    ...(input.about?.length
      ? { about: input.about.map((name) => ({ "@type": "Thing", name })) }
      : {}),
  };
}

/**
 * LocalBusiness (ElectronicsStore) for one store. Name, address and phone
 * come from the same helpers as the page and footer, so they always match.
 * No aggregateRating: Google ignores ratings a business shows about itself.
 */
export function storeJsonLd(store: PublicStore) {
  const [streetAddress] = storeAddressLines(store);
  return {
    "@context": "https://schema.org",
    "@type": "ElectronicsStore",
    "@id": absoluteUrl(`${storePath(store)}#store`),
    name: storeName(store),
    url: absoluteUrl(storePath(store)),
    telephone: store.phone,
    ...(store.email ? { email: store.email } : {}),
    parentOrganization: { "@id": absoluteUrl("/#organization") },
    address: {
      "@type": "PostalAddress",
      streetAddress,
      addressLocality: store.address.town,
      postalCode: store.address.postcode,
      addressCountry: "GB",
    },
    hasMap: storeDirectionsUrl(store),
    ...(store.photos.length
      ? { image: store.photos.map((photo) => absoluteUrl(mediaUrl(photo.key))) }
      : {}),
    ...(store.latitude != null && store.longitude != null
      ? { geo: { "@type": "GeoCoordinates", latitude: store.latitude, longitude: store.longitude } }
      : {}),
    ...(store.openingHours
      ? {
          openingHoursSpecification: DAYS.flatMap((day) => {
            const h = store.openingHours![day.key];
            return h
              ? [
                  {
                    "@type": "OpeningHoursSpecification",
                    dayOfWeek: `https://schema.org/${day.schema}`,
                    opens: h.opens,
                    closes: h.closes,
                  },
                ]
              : [];
          }),
        }
      : {}),
  };
}

export function storesJsonLd(list: PublicStore[]) {
  return list.map(storeJsonLd);
}

export type BreadcrumbItem = { label: string; href: string };

export function breadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      item: absoluteUrl(item.href),
    })),
  };
}
