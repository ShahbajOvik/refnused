import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import { StoreCard } from "@/components/stores/store-card";
import { siteConfig } from "@refnused/database/config/site";
import { storesIndexMetadata } from "@/lib/metadata-templates";
import { absoluteUrl, storesJsonLd } from "@refnused/database/lib/seo";
import { storeName, storePath } from "@refnused/database/lib/stores";
import { loadPublicStores } from "@/lib/stores-cache";

export const metadata = storesIndexMetadata();

export default async function StoresPage() {
  const stores = await loadPublicStores();
  return (
    <div className="page-container py-8">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Stores", href: "/stores" },
        ]}
      />
      <h1 className="mt-6 text-4xl font-semibold sm:text-5xl">Our stores</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
        Sell your phone over the counter, collect an order, or see a refurbished phone in person
        before you buy.
      </p>
      <ul className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {stores.map((store) => (
          <li key={store.slug} className="overflow-hidden rounded-2xl border bg-card">
            <StoreCard store={store} headingLevel={2} />
          </li>
        ))}
      </ul>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: `${siteConfig.name} stores`,
            itemListElement: stores.map((store, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: storeName(store),
              url: absoluteUrl(storePath(store)),
            })),
          },
          ...storesJsonLd(stores),
        ]}
      />
    </div>
  );
}
