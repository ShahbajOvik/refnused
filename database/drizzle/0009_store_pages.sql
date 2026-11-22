ALTER TABLE "stores" ADD COLUMN "parking_info" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "nearest_metro" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "photos" jsonb DEFAULT '[]'::jsonb NOT NULL;