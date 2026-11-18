"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { staffAction } from "@/auth/guards";
import { db } from "@/db";
import { orderDispatchedEmail, orderReadyEmail, requestDecisionEmail } from "@/lib/admin/messages";
import {
  advanceFulfilment,
  decideRequest,
  fulfilmentSchema,
  refundSchema,
  requestDecisionSchema,
  requestRefund,
} from "@/lib/admin/orders";
import { sendEmail } from "@/lib/notify/email";
import { sendSms } from "@/lib/notify/sms";
import { getOrderById, trackingUrl } from "@/lib/orders/order-service";
import { getPaymentGateway } from "@/lib/payments";
import { isUkMobile } from "@/lib/validation/uk";

export const advanceFulfilmentAction = staffAction(
  "orders.manage",
  fulfilmentSchema,
  async ({ staff, input, meta }) => {
    const { notify } = await advanceFulfilment(db, { ...input, staffId: staff.id }, meta);
    if (notify) {
      after(async () => {
        const order = await getOrderById(db, input.orderId);
        if (!order) return;
        const name = order.contactName ?? "there";
        if (notify === "dispatched" && order.tracking) {
          await sendEmail({
            to: order.email,
            ...orderDispatchedEmail({
              name,
              orderNumber: order.orderNumber,
              carrier: order.tracking.carrier,
              trackingNumber: order.tracking.number,
              trackingUrl: trackingUrl(order.tracking.carrier, order.tracking.number),
            }),
          }).catch((e) => console.error("[admin] dispatch email failed", e));
        }
        if (notify === "ready" && order.collectionStore) {
          const store = `${order.collectionStore.name}, ${order.collectionStore.street}, ${order.collectionStore.town}`;
          await sendEmail({
            to: order.email,
            ...orderReadyEmail({ name, orderNumber: order.orderNumber, store }),
          }).catch((e) => console.error("[admin] ready email failed", e));
          if (order.contactPhone && isUkMobile(order.contactPhone)) {
            await sendSms(
              order.contactPhone,
              `RefurbednUsed: order ${order.orderNumber} is ready to collect from ${order.collectionStore.name}, ${order.collectionStore.town}. Bring photo ID.`,
            ).catch((e) => console.error("[admin] ready SMS failed", e));
          }
        }
      });
    }
    revalidatePath("/admin/orders");
  },
);

export const refundAction = staffAction(
  "refunds.issue",
  refundSchema,
  async ({ staff, input, meta }) => {
    const result = await requestRefund(
      db,
      getPaymentGateway(),
      { ...input, staffId: staff.id },
      meta,
    );
    revalidatePath("/admin/orders");
    return result.amountPence;
  },
);

export const decideRequestAction = staffAction(
  "orders.manage",
  requestDecisionSchema,
  async ({ staff, input, meta }) => {
    const result = await decideRequest(db, { ...input, staffId: staff.id }, meta);
    after(async () => {
      const order = await getOrderById(db, result.orderId);
      if (!order) return;
      await sendEmail({
        to: order.email,
        ...requestDecisionEmail({
          name: order.contactName ?? "there",
          reference: result.reference,
          type: result.type,
          decision: input.decision,
          note: input.note,
        }),
      }).catch((e) => console.error("[admin] request email failed", e));
    });
    revalidatePath("/admin/returns");
    revalidatePath("/admin/orders");
  },
);
