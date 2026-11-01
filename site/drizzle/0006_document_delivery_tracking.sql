CREATE TABLE `reservation_document_deliveries` (
	`reservation_id` text NOT NULL,
	`kind` text NOT NULL,
	`event_key` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lease_ms` integer DEFAULT 0 NOT NULL,
	`first_attempt_ms` integer DEFAULT 0 NOT NULL,
	`updated_ms` integer NOT NULL,
	`provider_id` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `document_delivery_reservation` ON `reservation_document_deliveries` (`reservation_id`);