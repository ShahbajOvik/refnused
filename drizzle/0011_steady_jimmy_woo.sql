CREATE TYPE "public"."identifier_type" AS ENUM('imei', 'serial', 'none');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"identifier_type" "identifier_type" DEFAULT 'serial' NOT NULL,
	"has_storage" boolean DEFAULT true NOT NULL,
	"has_battery" boolean DEFAULT true NOT NULL,
	"requires_data_wipe" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_name_unique" UNIQUE("name"),
	CONSTRAINT "categories_slug_unique" UNIQUE("slug"),
	CONSTRAINT "categories_slug_check" CHECK ("categories"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "categories_imei_storage_check" CHECK ("categories"."identifier_type" <> 'imei' or "categories"."has_storage")
);
--> statement-breakpoint
ALTER TABLE "model_variants" DROP CONSTRAINT "model_variants_model_storage_colour_unique";--> statement-breakpoint
ALTER TABLE "model_variants" DROP CONSTRAINT "model_variants_storage_check";--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_wipe_certificate_check";--> statement-breakpoint
ALTER TABLE "model_variants" ALTER COLUMN "storage_gb" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "imei" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "battery_health_percent" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "device_models" ADD COLUMN "category_id" uuid;--> statement-breakpoint
INSERT INTO "categories" ("name", "slug", "sort_order", "identifier_type", "has_storage", "has_battery", "requires_data_wipe") VALUES ('Phones', 'phones', 1, 'imei', true, true, true);--> statement-breakpoint
UPDATE "device_models" SET "category_id" = (SELECT "id" FROM "categories" WHERE "slug" = 'phones');--> statement-breakpoint
ALTER TABLE "device_models" ALTER COLUMN "category_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "model_variants" ADD COLUMN "configuration" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "serial_number" varchar(64);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "data_wipe_required" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "device_models" ADD CONSTRAINT "device_models_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_models_category_idx" ON "device_models" USING btree ("category_id");--> statement-breakpoint
ALTER TABLE "model_variants" ADD CONSTRAINT "model_variants_model_options_unique" UNIQUE NULLS NOT DISTINCT("model_id","storage_gb","configuration","colour");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_serialNumber_unique" UNIQUE("serial_number");--> statement-breakpoint
ALTER TABLE "model_variants" ADD CONSTRAINT "model_variants_storage_check" CHECK ("model_variants"."storage_gb" is null or "model_variants"."storage_gb" > 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_identifier_check" CHECK (("products"."imei" is null) <> ("products"."serial_number" is null));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_serial_check" CHECK ("products"."serial_number" is null or "products"."serial_number" ~ '^[A-Z0-9][A-Z0-9._/-]{2,63}$');--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_wipe_certificate_check" CHECK ("products"."status" in ('draft', 'withdrawn') or not "products"."data_wipe_required" or "products"."data_wipe_certificate_key" is not null);