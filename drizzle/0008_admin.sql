ALTER TABLE "order_requests" ADD COLUMN "staff_notes" text;--> statement-breakpoint
ALTER TABLE "order_requests" ADD COLUMN "resolved_by_id" uuid;--> statement-breakpoint
ALTER TABLE "inspections" ADD COLUMN "photos" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "exported_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "export_batch_id" text;--> statement-breakpoint
ALTER TABLE "order_requests" ADD CONSTRAINT "order_requests_resolved_by_id_staff_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."staff_users"("id") ON DELETE set null ON UPDATE no action;