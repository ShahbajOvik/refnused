CREATE TYPE "public"."order_request_status" AS ENUM('submitted', 'approved', 'rejected', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."order_request_type" AS ENUM('return', 'warranty');--> statement-breakpoint
CREATE TABLE "order_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"type" "order_request_type" NOT NULL,
	"reason" text NOT NULL,
	"description" text NOT NULL,
	"status" "order_request_status" DEFAULT 'submitted' NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_requests_reference_unique" UNIQUE("reference"),
	CONSTRAINT "order_requests_description_check" CHECK (length("order_requests"."description") between 10 and 2000)
);
--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"livemode" boolean NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_amounts_check";--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_total_check";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "contact_name" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "contact_phone" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_option_key" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "trade_in_quote_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "trade_in_credit_pence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "access_token_hash" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fulfilled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "checkout_hold_order_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "checkout_hold_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_requests" ADD CONSTRAINT "order_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_requests" ADD CONSTRAINT "order_requests_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_requests_order_idx" ON "order_requests" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_requests_status_idx" ON "order_requests" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "order_requests_open_unique" ON "order_requests" USING btree ("order_item_id","type") WHERE "order_requests"."status" in ('submitted', 'approved');--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_trade_in_quote_id_quotes_id_fk" FOREIGN KEY ("trade_in_quote_id") REFERENCES "public"."quotes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_checkout_hold_order_id_orders_id_fk" FOREIGN KEY ("checkout_hold_order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_trade_in_quote_unique" ON "orders" USING btree ("trade_in_quote_id") WHERE "orders"."status" <> 'cancelled';--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_access_token_hash_unique" UNIQUE("access_token_hash");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_trade_in_check" CHECK (("orders"."trade_in_quote_id" is null) = ("orders"."trade_in_credit_pence" = 0));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_amounts_check" CHECK ("orders"."subtotal_pence" >= 0 and "orders"."delivery_pence" >= 0 and "orders"."discount_pence" >= 0 and "orders"."trade_in_credit_pence" >= 0 and "orders"."total_pence" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_check" CHECK ("orders"."total_pence" = "orders"."subtotal_pence" + "orders"."delivery_pence" - "orders"."discount_pence" - "orders"."trade_in_credit_pence");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_hold_check" CHECK (("products"."checkout_hold_order_id" is null) = ("products"."checkout_hold_until" is null));