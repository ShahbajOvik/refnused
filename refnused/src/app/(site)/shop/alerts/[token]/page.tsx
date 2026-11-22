import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/db";
import { getStockAlertByToken } from "@/lib/shop/stock-alerts";

import { unsubscribeStockAlertAction } from "../../actions";

export const metadata: Metadata = {
  title: "Stock alert",
  description: "Manage your RefurbednUsed stock alert.",
  robots: { index: false, follow: false },
  // The token is in the URL: never send it to other sites.
  referrer: "no-referrer",
};

/** Unsubscribe link from stock alert emails. Stopping needs a button press (POST). */
export default function StockAlertPage({ params }: PageProps<"/shop/alerts/[token]">) {
  return (
    <div className="page-container max-w-2xl py-8">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Shop", href: "/shop" },
          { label: "Stock alert", href: "/shop" },
        ]}
      />
      <h1 className="mt-6 text-3xl font-semibold">Stock alert</h1>
      <Suspense fallback={<Skeleton className="mt-6 h-32" />}>
        <AlertStatus params={params} />
      </Suspense>
    </div>
  );
}

async function AlertStatus({ params }: Pick<PageProps<"/shop/alerts/[token]">, "params">) {
  await connection();
  const { token } = await params;
  const alert = await getStockAlertByToken(db, token);

  if (!alert) {
    return (
      <p className="mt-4 text-muted-foreground">
        We couldn’t find that alert. The link may be incomplete.{" "}
        <Link href="/shop" className="font-medium text-primary underline underline-offset-4">
          Browse phones
        </Link>
      </p>
    );
  }
  const what = alert.storageGb ? `${alert.modelName} ${alert.storageGb}GB` : alert.modelName;
  if (!alert.isActive) {
    return (
      <p role="status" className="mt-4">
        You won’t get any more emails about the {what}.{" "}
        <Link href="/shop" className="font-medium text-primary underline underline-offset-4">
          Browse phones in stock
        </Link>
      </p>
    );
  }
  return (
    <form action={unsubscribeStockAlertAction} className="mt-4 flex flex-col items-start gap-4">
      <p>We’ll email you when a refurbished {what} is in stock.</p>
      <input type="hidden" name="token" value={token} />
      <Button type="submit" variant="outline" className="min-h-11">
        Stop this alert
      </Button>
    </form>
  );
}
