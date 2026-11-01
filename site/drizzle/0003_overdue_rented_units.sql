-- A rented vehicle remains operationally occupied until its actual return,
-- even after the scheduled rental period has ended.
DROP TRIGGER IF EXISTS `unit_active_reservation_guard`;
--> statement-breakpoint
CREATE TRIGGER `unit_active_reservation_guard`
BEFORE UPDATE OF `status`, `color`, `model_id` ON `units`
WHEN (NEW.status <> 'available' OR NEW.color <> OLD.color OR NEW.model_id <> OLD.model_id)
 AND EXISTS (SELECT 1 FROM reservations r WHERE r.unit_id=OLD.id
             AND (r.status='rented' OR (r.status='reserved'
                  AND r.end_ms > CAST(strftime('%s','now') AS INTEGER)*1000)))
BEGIN
 SELECT RAISE(ABORT,'UNIT_ACTIVE_RESERVATION');
END;
