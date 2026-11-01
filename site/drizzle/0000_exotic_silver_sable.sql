CREATE TABLE `blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`unit_id` text NOT NULL,
	`start_ms` integer NOT NULL,
	`end_ms` integer NOT NULL,
	`reason` text NOT NULL,
	`kind` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `block_unit_period` ON `blocks` (`unit_id`,`start_ms`,`end_ms`);--> statement-breakpoint
CREATE TABLE `rental_models` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`brand` text NOT NULL,
	`daily_cents` integer,
	`active` integer DEFAULT 1 NOT NULL,
	`spec` text NOT NULL,
	`photos` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`request_key` text NOT NULL,
	`unit_id` text NOT NULL,
	`model_id` text NOT NULL,
	`model_name` text NOT NULL,
	`start_ms` integer NOT NULL,
	`end_ms` integer NOT NULL,
	`days` integer NOT NULL,
	`daily_cents` integer NOT NULL,
	`protection_daily_cents` integer NOT NULL,
	`total_cents` integer NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`email` text NOT NULL,
	`city` text NOT NULL,
	`payment_method` text NOT NULL,
	`payment_status` text NOT NULL,
	`status` text NOT NULL,
	`created_ms` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reservation_code` ON `reservations` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `reservation_request_key` ON `reservations` (`request_key`);--> statement-breakpoint
CREATE INDEX `reservation_unit_period` ON `reservations` (`unit_id`,`start_ms`,`end_ms`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `units` (
	`id` text PRIMARY KEY NOT NULL,
	`model_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`label` text NOT NULL,
	`status` text DEFAULT 'available' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unit_model_ordinal` ON `units` (`model_id`,`ordinal`);