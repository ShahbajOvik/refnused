import { DELIVERY_OPTIONS, RETURN_POLICY } from "@/config/shop";
import { GRADE_INFO, type Grade } from "@/lib/grades";
import { absoluteUrl } from "@/lib/seo";

export type ProductAvailability = "in_stock" | "reserved" | "sold";

export type ProductJsonLdInput = {
  /** Path of the product page, e.g. /shop/apple/iphone-15-128gb-black-k3x9q2. */
  path: string;
  sku: string;
  brand: string;
  model: string;
  storageGb: number;
  colour: string;
  grade: Grade;
  batteryHealthPercent: number;
  warrantyMonths: number;
  pricePence: number;
  availability: ProductAvailability;
  /** Absolute or site-relative image URLs. */
  images: string[];
  store: { slug: string; name: string };
};

const AVAILABILITY: Record<ProductAvailability, string> = {
  in_stock: "https://schema.org/InStock",
  reserved: "https://schema.org/Reserved",
  sold: "https://schema.org/SoldOut",
};

/** Integer pence → "469.00", as schema.org expects. */
export function penceToDecimal(pence: number): string {
  if (!Number.isInteger(pence)) throw new TypeError(`Expected integer pence, received ${pence}`);
  const sign = pence < 0 ? "-" : "";
  const abs = Math.abs(pence);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

function quantity(range: { min: number; max: number }) {
  return {
    "@type": "QuantitativeValue",
    minValue: range.min,
    maxValue: range.max,
    unitCode: "DAY",
  };
}

export function merchantReturnPolicyJsonLd() {
  return {
    "@type": "MerchantReturnPolicy",
    applicableCountry: "GB",
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: RETURN_POLICY.days,
    returnMethod: [
      ...(RETURN_POLICY.byMail ? ["https://schema.org/ReturnByMail"] : []),
      ...(RETURN_POLICY.inStore ? ["https://schema.org/ReturnInStore"] : []),
    ],
    returnFees: RETURN_POLICY.freeReturns
      ? "https://schema.org/FreeReturn"
      : "https://schema.org/ReturnFeesCustomerResponsibility",
  };
}

export function shippingDetailsJsonLd() {
  return DELIVERY_OPTIONS.map((option) => ({
    "@type": "OfferShippingDetails",
    name: option.label,
    shippingRate: {
      "@type": "MonetaryAmount",
      value: penceToDecimal(option.pricePence),
      currency: "GBP",
    },
    shippingDestination: { "@type": "DefinedRegion", addressCountry: "GB" },
    deliveryTime: {
      "@type": "ShippingDeliveryTime",
      handlingTime: quantity(option.handlingDays),
      transitTime: quantity(option.transitDays),
    },
  }));
}

/** Product + Offer for one refurbished unit. */
export function productJsonLd(input: ProductJsonLdInput) {
  const url = absoluteUrl(input.path);
  const name = `${input.brand} ${input.model} ${input.storageGb}GB ${input.colour} (refurbished, Grade ${input.grade})`;
  const condition = "https://schema.org/RefurbishedCondition";
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#product`,
    name,
    description: `Refurbished ${input.brand} ${input.model}, ${input.storageGb}GB in ${input.colour}. Grade ${input.grade} (${GRADE_INFO[input.grade].label}): ${GRADE_INFO[input.grade].description} Battery health ${input.batteryHealthPercent}%. ${input.warrantyMonths}-month warranty.`,
    sku: input.sku,
    url,
    image: input.images.map((src) => absoluteUrl(src)),
    brand: { "@type": "Brand", name: input.brand },
    model: input.model,
    color: input.colour,
    itemCondition: condition,
    additionalProperty: [
      { "@type": "PropertyValue", name: "Storage", value: input.storageGb, unitText: "GB" },
      {
        "@type": "PropertyValue",
        name: "Cosmetic grade",
        value: `${input.grade} (${GRADE_INFO[input.grade].label})`,
      },
      {
        "@type": "PropertyValue",
        name: "Battery health",
        value: input.batteryHealthPercent,
        unitText: "percent",
      },
      {
        "@type": "PropertyValue",
        name: "Warranty",
        value: input.warrantyMonths,
        unitText: "months",
      },
    ],
    offers: {
      "@type": "Offer",
      url,
      price: penceToDecimal(input.pricePence),
      priceCurrency: "GBP",
      availability: AVAILABILITY[input.availability],
      itemCondition: condition,
      seller: { "@id": absoluteUrl("/#organization") },
      availableDeliveryMethod: [
        "http://purl.org/goodrelations/v1#DeliveryModeMail",
        "http://purl.org/goodrelations/v1#DeliveryModePickUp",
      ],
      availableAtOrFrom: { "@id": absoluteUrl(`/stores/${input.store.slug}#store`) },
      hasMerchantReturnPolicy: merchantReturnPolicyJsonLd(),
      shippingDetails: shippingDetailsJsonLd(),
    },
  };
}
