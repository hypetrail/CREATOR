ALTER TABLE `reservations` ADD `insurance` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `reservations` ADD `cleaning_prepaid_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `reservations` ADD `return_cleaning_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `reservations` ADD `return_dirty` integer DEFAULT 0 NOT NULL;