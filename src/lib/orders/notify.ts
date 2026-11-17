import "server-only";

import { db } from "@/db";
import { recordAudit } from "@/lib/audit";
import { getFieldCipher } from "@/lib/crypto/field-encryption";
import { sendEmail } from "@/lib/notify/email";
import { sendSms } from "@/lib/notify/sms";
import { absoluteUrl } from "@/lib/seo";
import { isUkMobile } from "@/lib/validation/uk";

import { orderConfirmationEmail, orderConfirmationSms } from "./messages";
import { getOrderForMessages } from "./order-service";

/** Order confirmation by email and (UK mobiles) SMS. Failures are audited, never thrown. */
export async function sendOrderConfirmation(orderId: string) {
  const order = await getOrderForMessages(db, orderId, getFieldCipher());
  if (!order) return;
  const orderUrl = absoluteUrl(order.accessToken ? `/orders/${order.accessToken}` : "/");
  const message = { ...order.message, orderUrl };
  const failures: string[] = [];
  await sendEmail({ to: order.email, ...orderConfirmationEmail(message) }).catch(() =>
    failures.push("email"),
  );
  if (order.phone && isUkMobile(order.phone)) {
    await sendSms(order.phone, orderConfirmationSms(message)).catch(() => failures.push("sms"));
  }
  if (failures.length) {
    await recordAudit(db, {
      actorType: "system",
      action: "order.notification_failed",
      entityType: "order",
      entityId: orderId,
      changes: { after: { channels: failures } },
    });
  }
}
