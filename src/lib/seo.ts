import { siteConfig } from "@/config/site";
import { publicEnv } from "@/lib/env";
import { mediaUrl } from "@/lib/media";
import {
  DAYS,
  type PublicStore,
  storeAddressLines,
  storeDirectionsUrl,
  storeName,
  storePath,
} from "@/lib/stores";

/** Absolute URL for canonical links, Open Graph and JSON-LD. */
export function absoluteUrl(path = "/"): string {
  return new URL(path, publicEnv.NEXT_PUBLIC_SITE_URL).toString();
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": absoluteUrl("/#organization"),
    name: siteConfig.name,
    url: absoluteUrl("/"),
    logo: absoluteUrl("/icon.svg"),
    description: siteConfig.description,
    areaServed: "GB",
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
