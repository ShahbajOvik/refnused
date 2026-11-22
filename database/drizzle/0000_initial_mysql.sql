CREATE TABLE `customer_addresses` (
	`id` varchar(36) NOT NULL,
	`customer_id` varchar(36) NOT NULL,
	`label` varchar(50),
	`name` text NOT NULL,
	`line1` text NOT NULL,
	`line2` text,
	`town` varchar(100) NOT NULL,
	`county` varchar(100),
	`postcode` varchar(10) NOT NULL,
	`is_default` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `customer_addresses_id` PRIMARY KEY(`id`),
	CONSTRAINT `customer_addresses_one_default` UNIQUE((case when `is_default` then `customer_id` end))
);
--> statement-breakpoint
CREATE TABLE `customer_payout_accounts` (
	`customer_id` varchar(36) NOT NULL,
	`account_holder_name_encrypted` text NOT NULL,
	`sort_code_encrypted` text NOT NULL,
	`account_number_encrypted` text NOT NULL,
	`account_number_last4` varchar(4) NOT NULL,
	`sort_code_last2` varchar(2) NOT NULL,
	`verified_at` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `customer_payout_accounts_customer_id` PRIMARY KEY(`customer_id`)
);
--> statement-breakpoint
CREATE TABLE `customer_verification_codes` (
	`id` varchar(36) NOT NULL,
	`customer_id` varchar(36) NOT NULL,
	`purpose` enum('payout_change','delete_account') NOT NULL,
	`code_hash` varchar(128) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`attempts` smallint NOT NULL DEFAULT 0,
	`consumed_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `customer_verification_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `customer_verification_codes_attempts_check` CHECK(`customer_verification_codes`.`attempts` between 0 and 10)
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`actor_type` enum('staff','customer','system') NOT NULL,
	`actor_id` varchar(36),
	`action` varchar(100) NOT NULL,
	`entity_type` varchar(64) NOT NULL,
	`entity_id` varchar(191) NOT NULL,
	`changes` json,
	`ip_address` varchar(64),
	`user_agent` text,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customer_accounts` (
	`user_id` varchar(36) NOT NULL,
	`type` varchar(255) NOT NULL,
	`provider` varchar(255) NOT NULL,
	`provider_account_id` varchar(255) NOT NULL,
	`refresh_token` text,
	`access_token` text,
	`expires_at` int,
	`token_type` varchar(255),
	`scope` varchar(255),
	`id_token` text,
	`session_state` varchar(255),
	CONSTRAINT `customer_accounts_pk` PRIMARY KEY(`provider`,`provider_account_id`)
);
--> statement-breakpoint
CREATE TABLE `customer_authenticators` (
	`credential_id` varchar(255) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`provider_account_id` varchar(255) NOT NULL,
	`credential_public_key` text NOT NULL,
	`counter` int NOT NULL,
	`credential_device_type` varchar(255) NOT NULL,
	`credential_backed_up` boolean NOT NULL,
	`transports` varchar(255),
	CONSTRAINT `customer_authenticators_pk` PRIMARY KEY(`user_id`,`credential_id`),
	CONSTRAINT `customer_authenticators_credential_id_unique` UNIQUE(`credential_id`)
);
--> statement-breakpoint
CREATE TABLE `customer_sessions` (
	`session_token` varchar(255) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`expires` timestamp(3) NOT NULL,
	CONSTRAINT `customer_sessions_session_token` PRIMARY KEY(`session_token`)
);
--> statement-breakpoint
CREATE TABLE `customer_verification_tokens` (
	`identifier` varchar(255) NOT NULL,
	`token` varchar(255) NOT NULL,
	`expires` timestamp(3) NOT NULL,
	CONSTRAINT `customer_verification_tokens_pk` PRIMARY KEY(`identifier`,`token`)
);
--> statement-breakpoint
CREATE TABLE `staff_accounts` (
	`user_id` varchar(36) NOT NULL,
	`type` varchar(255) NOT NULL,
	`provider` varchar(255) NOT NULL,
	`provider_account_id` varchar(255) NOT NULL,
	`refresh_token` text,
	`access_token` text,
	`expires_at` int,
	`token_type` varchar(255),
	`scope` varchar(255),
	`id_token` text,
	`session_state` varchar(255),
	CONSTRAINT `staff_accounts_pk` PRIMARY KEY(`provider`,`provider_account_id`)
);
--> statement-breakpoint
CREATE TABLE `staff_passkeys` (
	`id` varchar(36) NOT NULL,
	`staff_id` varchar(36) NOT NULL,
	`credential_id` varchar(255) NOT NULL,
	`public_key` text NOT NULL,
	`counter` int NOT NULL DEFAULT 0,
	`transports` json,
	`device_type` varchar(32) NOT NULL,
	`backed_up` boolean NOT NULL,
	`name` varchar(100) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`last_used_at` datetime(3),
	CONSTRAINT `staff_passkeys_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_passkeys_credential_id_unique` UNIQUE(`credential_id`)
);
--> statement-breakpoint
CREATE TABLE `staff_sessions` (
	`session_token` varchar(255) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`expires` timestamp(3) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`last_active_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`mfa_verified_at` datetime(3),
	`mfa_method` enum('passkey','totp'),
	`mfa_failed_attempts` smallint NOT NULL DEFAULT 0,
	`webauthn_challenge` varchar(255),
	`webauthn_challenge_expires_at` datetime(3),
	CONSTRAINT `staff_sessions_session_token` PRIMARY KEY(`session_token`)
);
--> statement-breakpoint
CREATE TABLE `staff_verification_tokens` (
	`identifier` varchar(255) NOT NULL,
	`token` varchar(255) NOT NULL,
	`expires` timestamp(3) NOT NULL,
	CONSTRAINT `staff_verification_tokens_pk` PRIMARY KEY(`identifier`,`token`)
);
--> statement-breakpoint
CREATE TABLE `brands` (
	`id` varchar(36) NOT NULL,
	`name` varchar(100) NOT NULL,
	`slug` varchar(100) NOT NULL,
	`logo_url` text,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `brands_id` PRIMARY KEY(`id`),
	CONSTRAINT `brands_name_unique` UNIQUE(`name`),
	CONSTRAINT `brands_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` varchar(36) NOT NULL,
	`name` varchar(100) NOT NULL,
	`slug` varchar(100) NOT NULL,
	`description` text,
	`sort_order` int NOT NULL DEFAULT 0,
	`identifier_type` enum('imei','serial','none') NOT NULL DEFAULT 'serial',
	`has_storage` boolean NOT NULL DEFAULT true,
	`has_battery` boolean NOT NULL DEFAULT true,
	`requires_data_wipe` boolean NOT NULL DEFAULT true,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `categories_name_unique` UNIQUE(`name`),
	CONSTRAINT `categories_slug_unique` UNIQUE(`slug`),
	CONSTRAINT `categories_slug_check` CHECK(regexp_like(`categories`.`slug`, '^[a-z0-9]+(-[a-z0-9]+)*$', 'c')),
	CONSTRAINT `categories_imei_storage_check` CHECK(`categories`.`identifier_type` <> 'imei' or `categories`.`has_storage`)
);
--> statement-breakpoint
CREATE TABLE `device_models` (
	`id` varchar(36) NOT NULL,
	`category_id` varchar(36) NOT NULL,
	`brand_id` varchar(36) NOT NULL,
	`name` varchar(150) NOT NULL,
	`slug` varchar(150) NOT NULL,
	`release_year` smallint NOT NULL,
	`image_url` text,
	`model3d_url` text,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `device_models_id` PRIMARY KEY(`id`),
	CONSTRAINT `device_models_slug_unique` UNIQUE(`slug`),
	CONSTRAINT `device_models_release_year_check` CHECK(`device_models`.`release_year` between 2007 and 2100)
);
--> statement-breakpoint
CREATE TABLE `model_variants` (
	`id` varchar(36) NOT NULL,
	`model_id` varchar(36) NOT NULL,
	`storage_gb` int,
	`configuration` varchar(255) NOT NULL DEFAULT '',
	`colour` varchar(64) NOT NULL,
	`colour_hex` varchar(7),
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `model_variants_id` PRIMARY KEY(`id`),
	CONSTRAINT `model_variants_model_options_unique` UNIQUE(`model_id`,(coalesce(`storage_gb`, -1)),`configuration`,`colour`),
	CONSTRAINT `model_variants_storage_check` CHECK(`model_variants`.`storage_gb` is null or `model_variants`.`storage_gb` > 0),
	CONSTRAINT `model_variants_colour_hex_check` CHECK(`model_variants`.`colour_hex` is null or regexp_like(`model_variants`.`colour_hex`, '^#[0-9a-fA-F]{6}$'))
);
--> statement-breakpoint
CREATE TABLE `trade_in_prices` (
	`id` varchar(36) NOT NULL,
	`variant_id` varchar(36) NOT NULL,
	`grade` enum('A','B','C','faulty') NOT NULL,
	`price_pence` int NOT NULL,
	`updated_by` varchar(36),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `trade_in_prices_id` PRIMARY KEY(`id`),
	CONSTRAINT `trade_in_prices_variant_grade_unique` UNIQUE(`variant_id`,`grade`),
	CONSTRAINT `trade_in_prices_price_check` CHECK(`trade_in_prices`.`price_pence` >= 0)
);
--> statement-breakpoint
CREATE TABLE `order_requests` (
	`id` varchar(36) NOT NULL,
	`reference` varchar(32) NOT NULL,
	`order_id` varchar(36) NOT NULL,
	`order_item_id` varchar(36) NOT NULL,
	`type` enum('return','warranty') NOT NULL,
	`reason` varchar(64) NOT NULL,
	`description` text NOT NULL,
	`status` enum('submitted','approved','rejected','completed','cancelled') NOT NULL DEFAULT 'submitted',
	`staff_notes` text,
	`resolved_by_id` varchar(36),
	`resolved_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `order_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `order_requests_reference_unique` UNIQUE(`reference`),
	CONSTRAINT `order_requests_open_unique` UNIQUE(`order_item_id`,`type`,(case when `status` in ('submitted', 'approved') then 1 end)),
	CONSTRAINT `order_requests_description_check` CHECK(char_length(`order_requests`.`description`) between 10 and 2000)
);
--> statement-breakpoint
CREATE TABLE `stripe_events` (
	`id` varchar(255) NOT NULL,
	`type` varchar(100) NOT NULL,
	`livemode` boolean NOT NULL,
	`processed_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `stripe_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` varchar(36) NOT NULL,
	`email` varchar(254) NOT NULL,
	`name` text,
	`phone` varchar(32),
	`email_verified` timestamp(3),
	`image` text,
	`marketing_opt_in` boolean NOT NULL DEFAULT false,
	`marketing_sms_opt_in` boolean NOT NULL DEFAULT false,
	`marketing_updated_at` datetime(3),
	`deleted_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `customers_id` PRIMARY KEY(`id`),
	CONSTRAINT `customers_email_idx` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `staff_users` (
	`id` varchar(36) NOT NULL,
	`email` varchar(254) NOT NULL,
	`name` text NOT NULL,
	`email_verified` timestamp(3),
	`image` text,
	`role` enum('owner','manager','staff','content_editor') NOT NULL,
	`password_hash` text,
	`password_changed_at` datetime(3),
	`store_id` varchar(36),
	`totp_secret_encrypted` text,
	`totp_enabled_at` datetime(3),
	`totp_last_used_step` int,
	`is_active` boolean NOT NULL DEFAULT true,
	`last_login_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `staff_users_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_users_email_idx` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` varchar(36) NOT NULL,
	`endpoint` text NOT NULL,
	`endpoint_hash` char(64) NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`last_sent_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `push_subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `push_subscriptions_endpoint_hash_unique` UNIQUE(`endpoint_hash`)
);
--> statement-breakpoint
CREATE TABLE `push_topics` (
	`id` varchar(36) NOT NULL,
	`subscription_id` varchar(36) NOT NULL,
	`kind` enum('quote','order','price_alerts') NOT NULL,
	`quote_id` varchar(36),
	`order_id` varchar(36),
	`customer_id` varchar(36),
	`path_encrypted` text,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `push_topics_id` PRIMARY KEY(`id`),
	CONSTRAINT `push_topics_unique` UNIQUE(`subscription_id`,`kind`,(coalesce(`quote_id`, `order_id`, `customer_id`)))
);
--> statement-breakpoint
CREATE TABLE `quote_answer_options` (
	`id` varchar(36) NOT NULL,
	`question_id` varchar(36) NOT NULL,
	`key` varchar(64) NOT NULL,
	`label` text NOT NULL,
	`description` text,
	`illustration` varchar(100),
	`sort_order` int NOT NULL DEFAULT 0,
	`grade_cap` enum('A','B','C','faulty'),
	`deduction_basis_points` int NOT NULL DEFAULT 0,
	`deduction_pence` int NOT NULL DEFAULT 0,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `quote_answer_options_id` PRIMARY KEY(`id`),
	CONSTRAINT `quote_answer_options_question_key_unique` UNIQUE(`question_id`,`key`),
	CONSTRAINT `quote_answer_options_deduction_check` CHECK(`quote_answer_options`.`deduction_basis_points` between 0 and 10000 and `quote_answer_options`.`deduction_pence` >= 0)
);
--> statement-breakpoint
CREATE TABLE `quote_questions` (
	`id` varchar(36) NOT NULL,
	`key` varchar(64) NOT NULL,
	`section` varchar(16) NOT NULL,
	`title` text NOT NULL,
	`help` text,
	`sort_order` int NOT NULL DEFAULT 0,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `quote_questions_id` PRIMARY KEY(`id`),
	CONSTRAINT `quote_questions_key_unique` UNIQUE(`key`),
	CONSTRAINT `quote_questions_section_check` CHECK(`quote_questions`.`section` in ('device', 'condition'))
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` varchar(191) NOT NULL,
	`window_start` datetime(3) NOT NULL,
	`count` int NOT NULL,
	CONSTRAINT `rate_limits_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` varchar(36) NOT NULL,
	`order_id` varchar(36) NOT NULL,
	`product_id` varchar(36) NOT NULL,
	`description` text NOT NULL,
	`unit_price_pence` int NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `order_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `order_items_order_product_unique` UNIQUE(`order_id`,`product_id`),
	CONSTRAINT `order_items_price_check` CHECK(`order_items`.`unit_price_pence` >= 0)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` varchar(36) NOT NULL,
	`order_number` varchar(32) NOT NULL,
	`customer_id` varchar(36),
	`email` varchar(254) NOT NULL,
	`contact_name` text,
	`contact_phone` varchar(32),
	`status` enum('pending_payment','paid','processing','dispatched','ready_for_collection','completed','cancelled','refunded','partially_refunded') NOT NULL DEFAULT 'pending_payment',
	`fulfilment_method` enum('delivery','click_and_collect') NOT NULL,
	`delivery_option_key` varchar(64),
	`collection_store_id` varchar(36),
	`shipping_address` json,
	`subtotal_pence` int NOT NULL,
	`delivery_pence` int NOT NULL DEFAULT 0,
	`discount_pence` int NOT NULL DEFAULT 0,
	`trade_in_quote_id` varchar(36),
	`trade_in_credit_pence` int NOT NULL DEFAULT 0,
	`total_pence` int NOT NULL,
	`currency` char(3) NOT NULL DEFAULT 'GBP',
	`stripe_checkout_session_id` varchar(255),
	`access_token_hash` varchar(128),
	`access_token_encrypted` text,
	`expires_at` datetime(3),
	`placed_at` datetime(3),
	`fulfilled_at` datetime(3),
	`tracking_carrier` varchar(64),
	`tracking_number` varchar(100),
	`ready_for_collection_at` datetime(3),
	`completed_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_order_number_unique` UNIQUE(`order_number`),
	CONSTRAINT `orders_stripe_checkout_session_id_unique` UNIQUE(`stripe_checkout_session_id`),
	CONSTRAINT `orders_access_token_hash_unique` UNIQUE(`access_token_hash`),
	CONSTRAINT `orders_trade_in_quote_unique` UNIQUE((case when `status` <> 'cancelled' then `trade_in_quote_id` end)),
	CONSTRAINT `orders_amounts_check` CHECK(`orders`.`subtotal_pence` >= 0 and `orders`.`delivery_pence` >= 0 and `orders`.`discount_pence` >= 0 and `orders`.`trade_in_credit_pence` >= 0 and `orders`.`total_pence` >= 0),
	CONSTRAINT `orders_total_check` CHECK(`orders`.`total_pence` = `orders`.`subtotal_pence` + `orders`.`delivery_pence` - `orders`.`discount_pence` - `orders`.`trade_in_credit_pence`),
	CONSTRAINT `orders_trade_in_check` CHECK((`orders`.`trade_in_quote_id` is null) = (`orders`.`trade_in_credit_pence` = 0)),
	CONSTRAINT `orders_fulfilment_check` CHECK((`orders`.`fulfilment_method` = 'delivery' and `orders`.`shipping_address` is not null) or (`orders`.`fulfilment_method` = 'click_and_collect' and `orders`.`collection_store_id` is not null))
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` varchar(36) NOT NULL,
	`order_id` varchar(36) NOT NULL,
	`provider` varchar(32) NOT NULL DEFAULT 'stripe',
	`stripe_payment_intent_id` varchar(255),
	`amount_pence` int NOT NULL,
	`amount_refunded_pence` int NOT NULL DEFAULT 0,
	`currency` char(3) NOT NULL DEFAULT 'GBP',
	`status` enum('requires_payment','processing','succeeded','failed','cancelled','refunded','partially_refunded') NOT NULL DEFAULT 'requires_payment',
	`failure_reason` text,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `payments_stripe_payment_intent_id_unique` UNIQUE(`stripe_payment_intent_id`),
	CONSTRAINT `payments_amount_check` CHECK(`payments`.`amount_pence` >= 0 and `payments`.`amount_refunded_pence` between 0 and `payments`.`amount_pence`)
);
--> statement-breakpoint
CREATE TABLE `price_alerts` (
	`id` varchar(36) NOT NULL,
	`customer_id` varchar(36) NOT NULL,
	`type` enum('shop','trade_in') NOT NULL,
	`model_id` varchar(36) NOT NULL,
	`variant_id` varchar(36),
	`grade` enum('A','B','C'),
	`target_price_pence` int NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`last_notified_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `price_alerts_id` PRIMARY KEY(`id`),
	CONSTRAINT `price_alerts_target_check` CHECK(`price_alerts`.`target_price_pence` > 0)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` varchar(36) NOT NULL,
	`slug` varchar(191) NOT NULL,
	`variant_id` varchar(36) NOT NULL,
	`imei` varchar(15),
	`serial_number` varchar(64),
	`grade` enum('A','B','C') NOT NULL,
	`battery_health_percent` smallint,
	`photos` json NOT NULL DEFAULT (JSON_ARRAY()),
	`price_pence` int NOT NULL,
	`store_id` varchar(36) NOT NULL,
	`status` enum('draft','listed','reserved','sold','returned','withdrawn') NOT NULL DEFAULT 'draft',
	`data_wipe_required` boolean NOT NULL DEFAULT true,
	`data_wipe_certificate_key` text,
	`warranty_months` smallint NOT NULL DEFAULT 12,
	`source_quote_id` varchar(36),
	`listed_at` datetime(3),
	`sold_at` datetime(3),
	`checkout_hold_order_id` varchar(36),
	`checkout_hold_until` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `products_slug_unique` UNIQUE(`slug`),
	CONSTRAINT `products_imei_unique` UNIQUE(`imei`),
	CONSTRAINT `products_serialNumber_unique` UNIQUE(`serial_number`),
	CONSTRAINT `products_slug_check` CHECK(regexp_like(`products`.`slug`, '^[a-z0-9]+(-[a-z0-9]+)*$', 'c')),
	CONSTRAINT `products_imei_check` CHECK(regexp_like(`products`.`imei`, '^[0-9]{15}$')),
	CONSTRAINT `products_identifier_check` CHECK((`products`.`imei` is null) <> (`products`.`serial_number` is null)),
	CONSTRAINT `products_serial_check` CHECK(`products`.`serial_number` is null or regexp_like(`products`.`serial_number`, '^[A-Z0-9][A-Z0-9._/-]{2,63}$', 'c')),
	CONSTRAINT `products_battery_check` CHECK(`products`.`battery_health_percent` between 0 and 100),
	CONSTRAINT `products_price_check` CHECK(`products`.`price_pence` > 0),
	CONSTRAINT `products_warranty_check` CHECK(`products`.`warranty_months` >= 0),
	CONSTRAINT `products_hold_check` CHECK((`products`.`checkout_hold_order_id` is null) = (`products`.`checkout_hold_until` is null)),
	CONSTRAINT `products_wipe_certificate_check` CHECK(`products`.`status` in ('draft', 'withdrawn') or not `products`.`data_wipe_required` or `products`.`data_wipe_certificate_key` is not null)
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` varchar(36) NOT NULL,
	`customer_id` varchar(36),
	`display_name` varchar(100) NOT NULL,
	`order_id` varchar(36),
	`quote_id` varchar(36),
	`model_id` varchar(36),
	`store_id` varchar(36),
	`rating` smallint NOT NULL,
	`title` text,
	`body` text NOT NULL,
	`status` enum('pending','published','rejected') NOT NULL DEFAULT 'pending',
	`is_verified` boolean NOT NULL DEFAULT false,
	`moderated_by` varchar(36),
	`published_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `reviews_id` PRIMARY KEY(`id`),
	CONSTRAINT `reviews_rating_check` CHECK(`reviews`.`rating` between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE `stock_alerts` (
	`id` varchar(36) NOT NULL,
	`email` varchar(254) NOT NULL,
	`customer_id` varchar(36),
	`model_id` varchar(36) NOT NULL,
	`storage_gb` int,
	`source_product_id` varchar(36),
	`unsubscribe_token_hash` varchar(128) NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`consented_at` datetime(3) NOT NULL,
	`last_notified_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `stock_alerts_id` PRIMARY KEY(`id`),
	CONSTRAINT `stock_alerts_unsubscribe_token_hash_unique` UNIQUE(`unsubscribe_token_hash`),
	CONSTRAINT `stock_alerts_active_unique` UNIQUE((case when `is_active` then `email` end),`model_id`,(coalesce(`storage_gb`, 0))),
	CONSTRAINT `stock_alerts_email_check` CHECK(cast(`stock_alerts`.`email` as binary) = cast(lower(`stock_alerts`.`email`) as binary)),
	CONSTRAINT `stock_alerts_storage_check` CHECK(`stock_alerts`.`storage_gb` is null or `stock_alerts`.`storage_gb` > 0)
);
--> statement-breakpoint
CREATE TABLE `stores` (
	`id` varchar(36) NOT NULL,
	`slug` varchar(100) NOT NULL,
	`name` varchar(120) NOT NULL,
	`street` varchar(200) NOT NULL,
	`town` varchar(100) NOT NULL,
	`postcode` varchar(10) NOT NULL,
	`latitude` double,
	`longitude` double,
	`opening_hours` json,
	`phone` varchar(32) NOT NULL,
	`email` varchar(254),
	`parking_info` text,
	`nearest_metro` text,
	`photos` json NOT NULL DEFAULT (JSON_ARRAY()),
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `stores_id` PRIMARY KEY(`id`),
	CONSTRAINT `stores_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `inspections` (
	`id` varchar(36) NOT NULL,
	`quote_id` varchar(36) NOT NULL,
	`staff_id` varchar(36) NOT NULL,
	`actual_grade` enum('A','B','C','faulty') NOT NULL,
	`revised_price_pence` int,
	`revised_offer_status` enum('not_required','pending','accepted','declined') NOT NULL DEFAULT 'not_required',
	`checkmend_result` enum('clear','lost_or_stolen','blocked','finance_outstanding','insurance_claim','error'),
	`checkmend_reference` varchar(100),
	`notes` text,
	`photos` json NOT NULL DEFAULT (JSON_ARRAY()),
	`inspected_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `inspections_id` PRIMARY KEY(`id`),
	CONSTRAINT `inspections_revised_price_check` CHECK(`inspections`.`revised_price_pence` is null or `inspections`.`revised_price_pence` >= 0),
	CONSTRAINT `inspections_revised_offer_check` CHECK((`inspections`.`revised_price_pence` is null) = (`inspections`.`revised_offer_status` = 'not_required'))
);
--> statement-breakpoint
CREATE TABLE `payouts` (
	`id` varchar(36) NOT NULL,
	`quote_id` varchar(36) NOT NULL,
	`customer_id` varchar(36) NOT NULL,
	`amount_pence` int NOT NULL,
	`method` enum('bank_transfer','in_store') NOT NULL,
	`status` enum('pending','processing','paid','failed','cancelled') NOT NULL DEFAULT 'pending',
	`account_holder_name_encrypted` text,
	`sort_code_encrypted` text,
	`account_number_encrypted` text,
	`account_number_last4` varchar(4),
	`reference` varchar(64),
	`paid_at` datetime(3),
	`exported_at` datetime(3),
	`export_batch_id` varchar(64),
	`processed_by` varchar(36),
	`failure_reason` text,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `payouts_id` PRIMARY KEY(`id`),
	CONSTRAINT `payouts_quote_id_unique` UNIQUE(`quote_id`),
	CONSTRAINT `payouts_amount_check` CHECK(`payouts`.`amount_pence` > 0),
	CONSTRAINT `payouts_bank_details_check` CHECK(`payouts`.`method` <> 'bank_transfer' or (`payouts`.`account_holder_name_encrypted` is not null and `payouts`.`sort_code_encrypted` is not null and `payouts`.`account_number_encrypted` is not null and `payouts`.`account_number_last4` is not null))
);
--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` varchar(36) NOT NULL,
	`reference` varchar(32) NOT NULL,
	`customer_id` varchar(36),
	`variant_id` varchar(36) NOT NULL,
	`quoted_grade` enum('A','B','C','faulty') NOT NULL,
	`answers` json NOT NULL,
	`offered_price_pence` int NOT NULL,
	`status` enum('offered','accepted','received','inspecting','revised','approved','paid','returned','rejected','expired','cancelled') NOT NULL DEFAULT 'offered',
	`price_locked_until` datetime(3) NOT NULL,
	`imei` varchar(15),
	`delivery_method` enum('freepost','courier_collection','store_drop_off','postage_pack','print_label'),
	`drop_off_store_id` varchar(36),
	`accepted_at` datetime(3),
	`received_at` datetime(3),
	`contact_name` text,
	`contact_email` varchar(254),
	`contact_phone` varchar(32),
	`contact_address` json,
	`offer_breakdown` json,
	`tracking_token_hash` varchar(128),
	`ownership_declared_at` datetime(3),
	`activation_lock_off_declared_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `quotes_id` PRIMARY KEY(`id`),
	CONSTRAINT `quotes_reference_unique` UNIQUE(`reference`),
	CONSTRAINT `quotes_tracking_token_hash_unique` UNIQUE(`tracking_token_hash`),
	CONSTRAINT `quotes_offered_price_check` CHECK(`quotes`.`offered_price_pence` >= 0),
	CONSTRAINT `quotes_imei_check` CHECK(`quotes`.`imei` is null or regexp_like(`quotes`.`imei`, '^[0-9]{15}$')),
	CONSTRAINT `quotes_drop_off_store_check` CHECK(not (`quotes`.`delivery_method` <=> 'store_drop_off') or `quotes`.`drop_off_store_id` is not null),
	CONSTRAINT `quotes_declarations_check` CHECK(`quotes`.`status` in ('offered', 'expired', 'cancelled') or (`quotes`.`ownership_declared_at` is not null and `quotes`.`activation_lock_off_declared_at` is not null and `quotes`.`contact_email` is not null)),
	CONSTRAINT `quotes_accepted_check` CHECK(`quotes`.`status` in ('offered', 'expired', 'cancelled') or (`quotes`.`customer_id` is not null and `quotes`.`delivery_method` is not null))
);
--> statement-breakpoint
ALTER TABLE `customer_addresses` ADD CONSTRAINT `customer_addresses_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_payout_accounts` ADD CONSTRAINT `customer_payout_accounts_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_verification_codes` ADD CONSTRAINT `customer_verification_codes_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_accounts` ADD CONSTRAINT `customer_accounts_user_id_customers_id_fk` FOREIGN KEY (`user_id`) REFERENCES `customers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_authenticators` ADD CONSTRAINT `customer_authenticators_user_id_customers_id_fk` FOREIGN KEY (`user_id`) REFERENCES `customers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_sessions` ADD CONSTRAINT `customer_sessions_user_id_customers_id_fk` FOREIGN KEY (`user_id`) REFERENCES `customers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_accounts` ADD CONSTRAINT `staff_accounts_user_id_staff_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `staff_users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_passkeys` ADD CONSTRAINT `staff_passkeys_staff_id_staff_users_id_fk` FOREIGN KEY (`staff_id`) REFERENCES `staff_users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_sessions` ADD CONSTRAINT `staff_sessions_user_id_staff_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `staff_users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `device_models` ADD CONSTRAINT `device_models_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `device_models` ADD CONSTRAINT `device_models_brand_id_brands_id_fk` FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `model_variants` ADD CONSTRAINT `model_variants_model_id_device_models_id_fk` FOREIGN KEY (`model_id`) REFERENCES `device_models`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `trade_in_prices` ADD CONSTRAINT `trade_in_prices_variant_id_model_variants_id_fk` FOREIGN KEY (`variant_id`) REFERENCES `model_variants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `trade_in_prices` ADD CONSTRAINT `trade_in_prices_updated_by_staff_users_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `staff_users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_requests` ADD CONSTRAINT `order_requests_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_requests` ADD CONSTRAINT `order_requests_order_item_id_order_items_id_fk` FOREIGN KEY (`order_item_id`) REFERENCES `order_items`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_requests` ADD CONSTRAINT `order_requests_resolved_by_id_staff_users_id_fk` FOREIGN KEY (`resolved_by_id`) REFERENCES `staff_users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_users` ADD CONSTRAINT `staff_users_store_id_stores_id_fk` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `push_topics` ADD CONSTRAINT `push_topics_subscription_id_push_subscriptions_id_fk` FOREIGN KEY (`subscription_id`) REFERENCES `push_subscriptions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `push_topics` ADD CONSTRAINT `push_topics_quote_id_quotes_id_fk` FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `push_topics` ADD CONSTRAINT `push_topics_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `push_topics` ADD CONSTRAINT `push_topics_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quote_answer_options` ADD CONSTRAINT `quote_answer_options_question_id_quote_questions_id_fk` FOREIGN KEY (`question_id`) REFERENCES `quote_questions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_collection_store_id_stores_id_fk` FOREIGN KEY (`collection_store_id`) REFERENCES `stores`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_trade_in_quote_id_quotes_id_fk` FOREIGN KEY (`trade_in_quote_id`) REFERENCES `quotes`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `price_alerts` ADD CONSTRAINT `price_alerts_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `price_alerts` ADD CONSTRAINT `price_alerts_model_id_device_models_id_fk` FOREIGN KEY (`model_id`) REFERENCES `device_models`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `price_alerts` ADD CONSTRAINT `price_alerts_variant_id_model_variants_id_fk` FOREIGN KEY (`variant_id`) REFERENCES `model_variants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_variant_id_model_variants_id_fk` FOREIGN KEY (`variant_id`) REFERENCES `model_variants`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_store_id_stores_id_fk` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_source_quote_id_quotes_id_fk` FOREIGN KEY (`source_quote_id`) REFERENCES `quotes`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_checkout_hold_order_id_orders_id_fk` FOREIGN KEY (`checkout_hold_order_id`) REFERENCES `orders`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_quote_id_quotes_id_fk` FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_model_id_device_models_id_fk` FOREIGN KEY (`model_id`) REFERENCES `device_models`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_store_id_stores_id_fk` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_moderated_by_staff_users_id_fk` FOREIGN KEY (`moderated_by`) REFERENCES `staff_users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_alerts` ADD CONSTRAINT `stock_alerts_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_alerts` ADD CONSTRAINT `stock_alerts_model_id_device_models_id_fk` FOREIGN KEY (`model_id`) REFERENCES `device_models`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_alerts` ADD CONSTRAINT `stock_alerts_source_product_id_products_id_fk` FOREIGN KEY (`source_product_id`) REFERENCES `products`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inspections` ADD CONSTRAINT `inspections_quote_id_quotes_id_fk` FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inspections` ADD CONSTRAINT `inspections_staff_id_staff_users_id_fk` FOREIGN KEY (`staff_id`) REFERENCES `staff_users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payouts` ADD CONSTRAINT `payouts_quote_id_quotes_id_fk` FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payouts` ADD CONSTRAINT `payouts_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payouts` ADD CONSTRAINT `payouts_processed_by_staff_users_id_fk` FOREIGN KEY (`processed_by`) REFERENCES `staff_users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_variant_id_model_variants_id_fk` FOREIGN KEY (`variant_id`) REFERENCES `model_variants`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_drop_off_store_id_stores_id_fk` FOREIGN KEY (`drop_off_store_id`) REFERENCES `stores`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `customer_addresses_customer_idx` ON `customer_addresses` (`customer_id`);--> statement-breakpoint
CREATE INDEX `customer_verification_codes_lookup_idx` ON `customer_verification_codes` (`customer_id`,`purpose`);--> statement-breakpoint
CREATE INDEX `audit_log_entity_idx` ON `audit_log` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_log_actor_idx` ON `audit_log` (`actor_id`);--> statement-breakpoint
CREATE INDEX `audit_log_created_at_idx` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `customer_accounts_user_idx` ON `customer_accounts` (`user_id`);--> statement-breakpoint
CREATE INDEX `customer_sessions_user_idx` ON `customer_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `staff_accounts_user_idx` ON `staff_accounts` (`user_id`);--> statement-breakpoint
CREATE INDEX `staff_passkeys_staff_idx` ON `staff_passkeys` (`staff_id`);--> statement-breakpoint
CREATE INDEX `staff_sessions_user_idx` ON `staff_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `device_models_brand_idx` ON `device_models` (`brand_id`);--> statement-breakpoint
CREATE INDEX `device_models_category_idx` ON `device_models` (`category_id`);--> statement-breakpoint
CREATE INDEX `order_requests_order_idx` ON `order_requests` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_requests_status_idx` ON `order_requests` (`status`);--> statement-breakpoint
CREATE INDEX `staff_users_store_idx` ON `staff_users` (`store_id`);--> statement-breakpoint
CREATE INDEX `push_topics_quote_idx` ON `push_topics` (`quote_id`);--> statement-breakpoint
CREATE INDEX `push_topics_order_idx` ON `push_topics` (`order_id`);--> statement-breakpoint
CREATE INDEX `push_topics_customer_idx` ON `push_topics` (`customer_id`);--> statement-breakpoint
CREATE INDEX `quote_answer_options_question_idx` ON `quote_answer_options` (`question_id`);--> statement-breakpoint
CREATE INDEX `order_items_product_idx` ON `order_items` (`product_id`);--> statement-breakpoint
CREATE INDEX `orders_customer_idx` ON `orders` (`customer_id`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE INDEX `payments_order_idx` ON `payments` (`order_id`);--> statement-breakpoint
CREATE INDEX `price_alerts_customer_idx` ON `price_alerts` (`customer_id`);--> statement-breakpoint
CREATE INDEX `price_alerts_active_model_idx` ON `price_alerts` (`model_id`,`is_active`);--> statement-breakpoint
CREATE INDEX `products_variant_idx` ON `products` (`variant_id`);--> statement-breakpoint
CREATE INDEX `products_store_idx` ON `products` (`store_id`);--> statement-breakpoint
CREATE INDEX `products_status_grade_idx` ON `products` (`status`,`grade`);--> statement-breakpoint
CREATE INDEX `products_status_listed_idx` ON `products` (`status`,`listed_at`);--> statement-breakpoint
CREATE INDEX `reviews_model_idx` ON `reviews` (`model_id`);--> statement-breakpoint
CREATE INDEX `reviews_store_idx` ON `reviews` (`store_id`);--> statement-breakpoint
CREATE INDEX `reviews_status_idx` ON `reviews` (`status`);--> statement-breakpoint
CREATE INDEX `stock_alerts_active_model_idx` ON `stock_alerts` (`model_id`,`is_active`);--> statement-breakpoint
CREATE INDEX `inspections_quote_idx` ON `inspections` (`quote_id`);--> statement-breakpoint
CREATE INDEX `payouts_customer_idx` ON `payouts` (`customer_id`);--> statement-breakpoint
CREATE INDEX `payouts_status_idx` ON `payouts` (`status`);--> statement-breakpoint
CREATE INDEX `quotes_customer_idx` ON `quotes` (`customer_id`);--> statement-breakpoint
CREATE INDEX `quotes_status_idx` ON `quotes` (`status`);--> statement-breakpoint
CREATE INDEX `quotes_imei_idx` ON `quotes` (`imei`);