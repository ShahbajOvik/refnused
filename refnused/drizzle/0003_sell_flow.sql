ALTER TYPE "public"."delivery_method" ADD VALUE 'postage_pack';--> statement-breakpoint
ALTER TYPE "public"."delivery_method" ADD VALUE 'print_label';--> statement-breakpoint
CREATE TABLE "quote_answer_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"illustration" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"grade_cap" "trade_in_grade",
	"deduction_basis_points" integer DEFAULT 0 NOT NULL,
	"deduction_pence" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quote_answer_options_question_key_unique" UNIQUE("question_id","key"),
	CONSTRAINT "quote_answer_options_deduction_check" CHECK ("quote_answer_options"."deduction_basis_points" between 0 and 10000 and "quote_answer_options"."deduction_pence" >= 0)
);
--> statement-breakpoint
CREATE TABLE "quote_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"section" text NOT NULL,
	"title" text NOT NULL,
	"help" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quote_questions_key_unique" UNIQUE("key"),
	CONSTRAINT "quote_questions_section_check" CHECK ("quote_questions"."section" in ('device', 'condition'))
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "contact_name" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "contact_phone" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "contact_address" jsonb;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "offer_breakdown" jsonb;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "tracking_token_hash" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "ownership_declared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "activation_lock_off_declared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quote_answer_options" ADD CONSTRAINT "quote_answer_options_question_id_quote_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."quote_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quote_answer_options_question_idx" ON "quote_answer_options" USING btree ("question_id");--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_tracking_token_hash_unique" UNIQUE("tracking_token_hash");--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_declarations_check" CHECK ("quotes"."status" in ('offered', 'expired', 'cancelled') or ("quotes"."ownership_declared_at" is not null and "quotes"."activation_lock_off_declared_at" is not null and "quotes"."contact_email" is not null));