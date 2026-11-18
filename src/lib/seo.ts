import { siteConfig } from "@/config/site";
import { publicEnv } from "@/lib/env";
import { DAYS, type PublicStore } from "@/lib/stores";

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

export function storesJsonLd(list: PublicStore[]) {
  return list.map((store) => ({
    "@context": "https://schema.org",
    "@type": "MobilePhoneStore",
    "@id": absoluteUrl(`/stores/${store.slug}#store`),
    name: `${store.name}, ${store.address.town}`,
    url: absoluteUrl(`/stores/${store.slug}`),
    telephone: store.phone,
    parentOrganization: { "@id": absoluteUrl("/#organization") },
    address: {
      "@type": "PostalAddress",
      streetAddress: store.address.street,
      addressLocality: store.address.town,
      postalCode: store.address.postcode,
      addressCountry: "GB",
    },
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
  }));
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
