CREATE TABLE "stock_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"customer_id" uuid,
	"model_id" uuid NOT NULL,
	"storage_gb" integer,
	"source_product_id" uuid,
	"unsubscribe_token_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"consented_at" timestamp with time zone NOT NULL,
	"last_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_alerts_unsubscribe_token_hash_unique" UNIQUE("unsubscribe_token_hash"),
	CONSTRAINT "stock_alerts_email_check" CHECK ("stock_alerts"."email" = lower("stock_alerts"."email")),
	CONSTRAINT "stock_alerts_storage_check" CHECK ("stock_alerts"."storage_gb" is null or "stock_alerts"."storage_gb" > 0)
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "slug" text;--> statement-breakpoint
-- Backfill existing units: <model>-<storage>gb-<colour>-<6 chars from the id>
UPDATE "products" AS p SET "slug" = trim(both '-' from regexp_replace(lower(m."slug" || '-' || v."storage_gb" || 'gb-' || v."colour"), '[^a-z0-9]+', '-', 'g')) || '-' || substr(md5(p."id"::text), 1, 6)
FROM "model_variants" AS v JOIN "device_models" AS m ON m."id" = v."model_id"
WHERE v."id" = p."variant_id";--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_model_id_device_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."device_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_source_product_id_products_id_fk" FOREIGN KEY ("source_product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stock_alerts_active_unique" ON "stock_alerts" USING btree (lower("email"),"model_id",coalesce("storage_gb", 0)) WHERE "stock_alerts"."is_active";--> statement-breakpoint
CREATE INDEX "stock_alerts_active_model_idx" ON "stock_alerts" USING btree ("model_id") WHERE "stock_alerts"."is_active";--> statement-breakpoint
CREATE INDEX "products_status_listed_idx" ON "products" USING btree ("status","listed_at");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_slug_unique" UNIQUE("slug");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_slug_check" CHECK ("products"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');