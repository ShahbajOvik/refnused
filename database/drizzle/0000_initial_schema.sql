CREATE TYPE "public"."actor_type" AS ENUM('staff', 'customer', 'system');--> statement-breakpoint
CREATE TYPE "public"."checkmend_result" AS ENUM('clear', 'lost_or_stolen', 'blocked', 'finance_outstanding', 'insurance_claim', 'error');--> statement-breakpoint
CREATE TYPE "public"."delivery_method" AS ENUM('freepost', 'courier_collection', 'store_drop_off');--> statement-breakpoint
CREATE TYPE "public"."fulfilment_method" AS ENUM('delivery', 'click_and_collect');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending_payment', 'paid', 'processing', 'dispatched', 'ready_for_collection', 'completed', 'cancelled', 'refunded', 'partially_refunded');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('requires_payment', 'processing', 'succeeded', 'failed', 'cancelled', 'refunded', 'partially_refunded');--> statement-breakpoint
CREATE TYPE "public"."payout_method" AS ENUM('bank_transfer', 'in_store');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('pending', 'processing', 'paid', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."price_alert_type" AS ENUM('shop', 'trade_in');--> statement-breakpoint
CREATE TYPE "public"."product_grade" AS ENUM('A', 'B', 'C');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('draft', 'listed', 'reserved', 'sold', 'returned', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('offered', 'accepted', 'received', 'inspecting', 'revised', 'approved', 'paid', 'returned', 'rejected', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'published', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."revised_offer_status" AS ENUM('not_required', 'pending', 'accepted', 'declined');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('admin', 'manager', 'inspector', 'store_staff');--> statement-breakpoint
CREATE TYPE "public"."trade_in_grade" AS ENUM('A', 'B', 'C', 'faulty');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor_type" "actor_type" NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"changes" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brands_name_unique" UNIQUE("name"),
	CONSTRAINT "brands_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "device_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"release_year" smallint NOT NULL,
	"image_url" text,
	"model3d_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_models_slug_unique" UNIQUE("slug"),
	CONSTRAINT "device_models_release_year_check" CHECK ("device_models"."release_year" between 2007 and 2100)
);
--> statement-breakpoint
CREATE TABLE "model_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"storage_gb" integer NOT NULL,
	"colour" text NOT NULL,
	"colour_hex" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_variants_model_storage_colour_unique" UNIQUE("model_id","storage_gb","colour"),
	CONSTRAINT "model_variants_storage_check" CHECK ("model_variants"."storage_gb" > 0),
	CONSTRAINT "model_variants_colour_hex_check" CHECK ("model_variants"."colour_hex" is null or "model_variants"."colour_hex" ~ '^#[0-9a-fA-F]{6}$')
);
--> statement-breakpoint
CREATE TABLE "trade_in_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"grade" "trade_in_grade" NOT NULL,
	"price_pence" integer NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trade_in_prices_variant_grade_unique" UNIQUE("variant_id","grade"),
	CONSTRAINT "trade_in_prices_price_check" CHECK ("trade_in_prices"."price_pence" >= 0)
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"phone" text,
	"email_verified" timestamp with time zone,
	"image" text,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "staff_role" NOT NULL,
	"store_id" uuid,
	"password_hash" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"description" text NOT NULL,
	"unit_price_pence" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_order_product_unique" UNIQUE("order_id","product_id"),
	CONSTRAINT "order_items_price_check" CHECK ("order_items"."unit_price_pence" >= 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"customer_id" uuid,
	"email" text NOT NULL,
	"status" "order_status" DEFAULT 'pending_payment' NOT NULL,
	"fulfilment_method" "fulfilment_method" NOT NULL,
	"collection_store_id" uuid,
	"shipping_address" jsonb,
	"subtotal_pence" integer NOT NULL,
	"delivery_pence" integer DEFAULT 0 NOT NULL,
	"discount_pence" integer DEFAULT 0 NOT NULL,
	"total_pence" integer NOT NULL,
	"currency" char(3) DEFAULT 'GBP' NOT NULL,
	"stripe_checkout_session_id" text,
	"placed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number"),
	CONSTRAINT "orders_stripe_checkout_session_id_unique" UNIQUE("stripe_checkout_session_id"),
	CONSTRAINT "orders_amounts_check" CHECK ("orders"."subtotal_pence" >= 0 and "orders"."delivery_pence" >= 0 and "orders"."discount_pence" >= 0 and "orders"."total_pence" >= 0),
	CONSTRAINT "orders_total_check" CHECK ("orders"."total_pence" = "orders"."subtotal_pence" + "orders"."delivery_pence" - "orders"."discount_pence"),
	CONSTRAINT "orders_fulfilment_check" CHECK (("orders"."fulfilment_method" = 'delivery' and "orders"."shipping_address" is not null) or ("orders"."fulfilment_method" = 'click_and_collect' and "orders"."collection_store_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" text DEFAULT 'stripe' NOT NULL,
	"stripe_payment_intent_id" text,
	"amount_pence" integer NOT NULL,
	"amount_refunded_pence" integer DEFAULT 0 NOT NULL,
	"currency" char(3) DEFAULT 'GBP' NOT NULL,
	"status" "payment_status" DEFAULT 'requires_payment' NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_stripe_payment_intent_id_unique" UNIQUE("stripe_payment_intent_id"),
	CONSTRAINT "payments_amount_check" CHECK ("payments"."amount_pence" >= 0 and "payments"."amount_refunded_pence" between 0 and "payments"."amount_pence")
);
--> statement-breakpoint
CREATE TABLE "price_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"type" "price_alert_type" NOT NULL,
	"model_id" uuid NOT NULL,
	"variant_id" uuid,
	"grade" "product_grade",
	"target_price_pence" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_alerts_target_check" CHECK ("price_alerts"."target_price_pence" > 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"imei" varchar(15) NOT NULL,
	"grade" "product_grade" NOT NULL,
	"battery_health_percent" smallint NOT NULL,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"price_pence" integer NOT NULL,
	"store_id" uuid NOT NULL,
	"status" "product_status" DEFAULT 'draft' NOT NULL,
	"data_wipe_certificate_key" text,
	"warranty_months" smallint DEFAULT 12 NOT NULL,
	"source_quote_id" uuid,
	"listed_at" timestamp with time zone,
	"sold_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_imei_unique" UNIQUE("imei"),
	CONSTRAINT "products_imei_check" CHECK ("products"."imei" ~ '^[0-9]{15}$'),
	CONSTRAINT "products_battery_check" CHECK ("products"."battery_health_percent" between 0 and 100),
	CONSTRAINT "products_price_check" CHECK ("products"."price_pence" > 0),
	CONSTRAINT "products_warranty_check" CHECK ("products"."warranty_months" >= 0),
	CONSTRAINT "products_wipe_certificate_check" CHECK ("products"."status" in ('draft', 'withdrawn') or "products"."data_wipe_certificate_key" is not null)
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid,
	"display_name" text NOT NULL,
	"order_id" uuid,
	"quote_id" uuid,
	"model_id" uuid,
	"store_id" uuid,
	"rating" smallint NOT NULL,
	"title" text,
	"body" text NOT NULL,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"moderated_by" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_rating_check" CHECK ("reviews"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"street" text NOT NULL,
	"town" text NOT NULL,
	"postcode" text NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"opening_hours" jsonb,
	"phone" text NOT NULL,
	"email" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stores_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"actual_grade" "trade_in_grade" NOT NULL,
	"revised_price_pence" integer,
	"revised_offer_status" "revised_offer_status" DEFAULT 'not_required' NOT NULL,
	"checkmend_result" "checkmend_result",
	"checkmend_reference" text,
	"notes" text,
	"inspected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inspections_revised_price_check" CHECK ("inspections"."revised_price_pence" is null or "inspections"."revised_price_pence" >= 0),
	CONSTRAINT "inspections_revised_offer_check" CHECK (("inspections"."revised_price_pence" is null) = ("inspections"."revised_offer_status" = 'not_required'))
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"amount_pence" integer NOT NULL,
	"method" "payout_method" NOT NULL,
	"status" "payout_status" DEFAULT 'pending' NOT NULL,
	"account_holder_name_encrypted" text,
	"sort_code_encrypted" text,
	"account_number_encrypted" text,
	"account_number_last4" varchar(4),
	"reference" text,
	"paid_at" timestamp with time zone,
	"processed_by" uuid,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payouts_quote_id_unique" UNIQUE("quote_id"),
	CONSTRAINT "payouts_amount_check" CHECK ("payouts"."amount_pence" > 0),
	CONSTRAINT "payouts_bank_details_check" CHECK ("payouts"."method" <> 'bank_transfer' or ("payouts"."account_holder_name_encrypted" is not null and "payouts"."sort_code_encrypted" is not null and "payouts"."account_number_encrypted" is not null and "payouts"."account_number_last4" is not null))
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"customer_id" uuid,
	"variant_id" uuid NOT NULL,
	"quoted_grade" "trade_in_grade" NOT NULL,
	"answers" jsonb NOT NULL,
	"offered_price_pence" integer NOT NULL,
	"status" "quote_status" DEFAULT 'offered' NOT NULL,
	"price_locked_until" timestamp with time zone NOT NULL,
	"imei" varchar(15),
	"delivery_method" "delivery_method",
	"drop_off_store_id" uuid,
	"accepted_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotes_reference_unique" UNIQUE("reference"),
	CONSTRAINT "quotes_offered_price_check" CHECK ("quotes"."offered_price_pence" >= 0),
	CONSTRAINT "quotes_imei_check" CHECK ("quotes"."imei" is null or "quotes"."imei" ~ '^[0-9]{15}$'),
	CONSTRAINT "quotes_drop_off_store_check" CHECK ("quotes"."delivery_method" is distinct from 'store_drop_off' or "quotes"."drop_off_store_id" is not null),
	CONSTRAINT "quotes_accepted_check" CHECK ("quotes"."status" in ('offered', 'expired', 'cancelled') or ("quotes"."customer_id" is not null and "quotes"."delivery_method" is not null))
);
--> statement-breakpoint
ALTER TABLE "device_models" ADD CONSTRAINT "device_models_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_variants" ADD CONSTRAINT "model_variants_model_id_device_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."device_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_in_prices" ADD CONSTRAINT "trade_in_prices_variant_id_model_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."model_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_in_prices" ADD CONSTRAINT "trade_in_prices_updated_by_staff_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."staff_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_users" ADD CONSTRAINT "staff_users_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_collection_store_id_stores_id_fk" FOREIGN KEY ("collection_store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_model_id_device_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."device_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_variant_id_model_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."model_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_variant_id_model_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."model_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_source_quote_id_quotes_id_fk" FOREIGN KEY ("source_quote_id") REFERENCES "public"."quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_model_id_device_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."device_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_moderated_by_staff_users_id_fk" FOREIGN KEY ("moderated_by") REFERENCES "public"."staff_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_staff_id_staff_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_processed_by_staff_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."staff_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_variant_id_model_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."model_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_drop_off_store_id_stores_id_fk" FOREIGN KEY ("drop_off_store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "device_models_brand_idx" ON "device_models" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_email_lower_idx" ON "customers" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "staff_users_email_lower_idx" ON "staff_users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "staff_users_store_idx" ON "staff_users" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "order_items_product_idx" ON "order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "price_alerts_customer_idx" ON "price_alerts" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "price_alerts_active_model_idx" ON "price_alerts" USING btree ("model_id") WHERE "price_alerts"."is_active";--> statement-breakpoint
CREATE INDEX "products_variant_idx" ON "products" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "products_store_idx" ON "products" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "products_status_grade_idx" ON "products" USING btree ("status","grade");--> statement-breakpoint
CREATE INDEX "reviews_model_idx" ON "reviews" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "reviews_store_idx" ON "reviews" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "reviews_status_idx" ON "reviews" USING btree ("status");--> statement-breakpoint
CREATE INDEX "inspections_quote_idx" ON "inspections" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "payouts_customer_idx" ON "payouts" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "payouts_status_idx" ON "payouts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "quotes_customer_idx" ON "quotes" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "quotes_status_idx" ON "quotes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "quotes_imei_idx" ON "quotes" USING btree ("imei");