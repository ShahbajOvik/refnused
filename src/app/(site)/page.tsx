import type { Metadata } from "next";

import { FeaturedPhones } from "@/components/home/featured-phones";
import { Faq, faqJsonLd } from "@/components/home/faq";
import { GradingExplainer } from "@/components/home/grading";
import { Hero } from "@/components/home/hero/hero";
import { HERO_POSTER } from "@/components/home/hero/config";
import { HowItWorks } from "@/components/home/how-it-works";
import { PricePromise } from "@/components/home/price-promise";
import { QuickQuote } from "@/components/home/quick-quote";
import { ReviewsSection } from "@/components/home/reviews-section";
import { StoresSection } from "@/components/home/stores-section";
import { MotionProvider } from "@/components/motion/motion-provider";
import { JsonLd } from "@/components/seo/json-ld";
import { siteConfig } from "@/config/site";
import { absoluteUrl, organizationJsonLd, storesJsonLd } from "@/lib/seo";
import { loadPublicStores } from "@/lib/stores-cache";

export const metadata: Metadata = {
  title: { absolute: `${siteConfig.name}: sell your phone or buy refurbished` },
  description:
    "Get an instant quote for your used phone, or buy a graded refurbished phone with a warranty. Online, or in store in North Shields and South Shields.",
  alternates: { canonical: "/" },
  openGraph: {
    title: `${siteConfig.name}: sell your phone or buy refurbished`,
    url: "/",
    images: [
      { url: HERO_POSTER.src, width: HERO_POSTER.width, height: HERO_POSTER.height, alt: "" },
    ],
  },
};

export default function HomePage() {
  return (
    <MotionProvider>
      <Hero />
      <QuickQuote />
      <HowItWorks />
      <PricePromise />
      <FeaturedPhones />
      <GradingExplainer />
      <StoresSection />
      <ReviewsSection />
      <Faq />
      <JsonLd
        data={[
          organizationJsonLd(),
          {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: siteConfig.name,
            url: absoluteUrl("/"),
            inLanguage: "en-GB",
          },
          faqJsonLd(),
        ]}
      />
      <StoresJsonLd />
    </MotionProvider>
  );
}

async function StoresJsonLd() {
  return <JsonLd data={storesJsonLd(await loadPublicStores())} />;
}
