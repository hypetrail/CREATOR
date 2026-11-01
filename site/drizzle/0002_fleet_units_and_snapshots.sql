ALTER TABLE `rental_models` ADD `colors` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `units` ADD `color` text DEFAULT 'nao-informada' NOT NULL;
--> statement-breakpoint
ALTER TABLE `units` ADD `identifier` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `reservations` ADD `color` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `reservations` ADD `color_name` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `reservations` ADD `unit_label` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `reservations` ADD `terms_version` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `reservations` ADD `terms_snapshot` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `reservations` ADD `request_fingerprint` text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `unit_identifier_unique` ON `units` (`identifier`) WHERE `identifier` <> '';
--> statement-breakpoint
-- The check belongs to the write, including legacy administrative callers.
CREATE TRIGGER `unit_active_reservation_guard`
BEFORE UPDATE OF `status`, `color`, `model_id` ON `units`
WHEN (NEW.status <> 'available' OR NEW.color <> OLD.color OR NEW.model_id <> OLD.model_id)
 AND EXISTS (SELECT 1 FROM reservations r WHERE r.unit_id=OLD.id
             AND r.status IN ('reserved','rented')
             AND r.end_ms > CAST(strftime('%s','now') AS INTEGER)*1000)
BEGIN
 SELECT RAISE(ABORT,'UNIT_ACTIVE_RESERVATION');
END;
--> statement-breakpoint
CREATE TRIGGER `unit_history_delete_guard`
BEFORE DELETE ON `units`
WHEN EXISTS (SELECT 1 FROM reservations r WHERE r.unit_id=OLD.id)
BEGIN
 SELECT RAISE(ABORT,'UNIT_HAS_HISTORY_ARCHIVE_INSTEAD');
END;
