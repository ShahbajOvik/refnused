CREATE TYPE "public"."push_topic_kind" AS ENUM('quote', 'order', 'price_alerts');--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"last_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "push_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"kind" "push_topic_kind" NOT NULL,
	"quote_id" uuid,
	"order_id" uuid,
	"customer_id" uuid,
	"path_encrypted" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_topics_target_check" CHECK (("push_topics"."kind" = 'quote' and "push_topics"."quote_id" is not null and "push_topics"."order_id" is null and "push_topics"."customer_id" is null and "push_topics"."path_encrypted" is not null)
        or ("push_topics"."kind" = 'order' and "push_topics"."order_id" is not null and "push_topics"."quote_id" is null and "push_topics"."customer_id" is null and "push_topics"."path_encrypted" is not null)
        or ("push_topics"."kind" = 'price_alerts' and "push_topics"."customer_id" is not null and "push_topics"."quote_id" is null and "push_topics"."order_id" is null))
);
--> statement-breakpoint
ALTER TABLE "push_topics" ADD CONSTRAINT "push_topics_subscription_id_push_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."push_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_topics" ADD CONSTRAINT "push_topics_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_topics" ADD CONSTRAINT "push_topics_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_topics" ADD CONSTRAINT "push_topics_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "push_topics_unique" ON "push_topics" USING btree ("subscription_id","kind",coalesce("quote_id", "order_id", "customer_id"));--> statement-breakpoint
CREATE INDEX "push_topics_quote_idx" ON "push_topics" USING btree ("quote_id") WHERE "push_topics"."quote_id" is not null;--> statement-breakpoint
CREATE INDEX "push_topics_order_idx" ON "push_topics" USING btree ("order_id") WHERE "push_topics"."order_id" is not null;--> statement-breakpoint
CREATE INDEX "push_topics_customer_idx" ON "push_topics" USING btree ("customer_id") WHERE "push_topics"."customer_id" is not null;