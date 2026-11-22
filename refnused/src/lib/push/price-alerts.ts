import "server-only";

import { db } from "@refnused/database/db";
import {
  findTriggeredPriceAlerts,
  markPriceAlertsNotified,
  modelIdsFor,
} from "@/lib/account/price-alert-check";

import { priceAlertPush } from "@refnused/database/lib/push/messages";
import { pushToTarget } from "@refnused/database/lib/push/send";

/**
 * Checks price alerts for the changed phones and pushes the ones that are
 * met. Call from `after()` once the change is committed. Never throws.
 */
export async function pushPriceAlerts(changed: { variantIds?: string[]; productIds?: string[] }) {
  try {
    const modelIds = await modelIdsFor(db, changed);
    const alerts = await findTriggeredPriceAlerts(db, { modelIds });
    const notified: string[] = [];
    for (const alert of alerts) {
      const { sent } = await pushToTarget(
        { kind: "price_alerts", customerId: alert.customerId },
        () => priceAlertPush(alert),
      );
      if (sent) notified.push(alert.id);
    }
    await markPriceAlertsNotified(db, notified);
  } catch (error) {
    console.error("[push] price alerts failed", (error as Error).name);
  }
}
