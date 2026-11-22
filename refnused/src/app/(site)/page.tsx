import { FeaturedPhones } from "@/components/home/featured-phones";
import { Faq, faqJsonLd } from "@/components/home/faq";
import { GradingExplainer } from "@/components/home/grading";
import { Hero } from "@/components/home/hero/hero";
import { HowItWorks } from "@/components/home/how-it-works";
import { PricePromise } from "@/components/home/price-promise";
import { QuickQuote } from "@/components/home/quick-quote";
import { ReviewsSection } from "@/components/home/reviews-section";
import { StoresSection } from "@/components/home/stores-section";
import { MotionProvider } from "@/components/motion/motion-provider";
import { JsonLd } from "@/components/seo/json-ld";
import { homeMetadata } from "@/lib/metadata-templates";
import { organizationJsonLd, storesJsonLd, websiteJsonLd } from "@refnused/database/lib/seo";
import { loadPublicStores } from "@/lib/stores-cache";

export const metadata = homeMetadata();

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
      <JsonLd data={faqJsonLd()} />
      <SiteJsonLd />
    </MotionProvider>
  );
}

/** Organization and WebSite, plus each store (linked to the Organization by @id). */
async function SiteJsonLd() {
  const stores = await loadPublicStores();
  return <JsonLd data={[organizationJsonLd(stores), websiteJsonLd(), ...storesJsonLd(stores)]} />;
}
