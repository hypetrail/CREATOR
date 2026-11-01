CREATE TABLE rental_inspections (
 id text PRIMARY KEY NOT NULL,
 reservation_id text NOT NULL,
 kind text NOT NULL,
 payload text NOT NULL,
 created_ms integer NOT NULL,
 created_by text NOT NULL
);
CREATE INDEX inspection_reservation_kind ON rental_inspections(reservation_id,kind,created_ms);
CREATE TABLE inspection_photos (
 id text PRIMARY KEY NOT NULL,
 reservation_id text NOT NULL,
 storage_key text NOT NULL,
 mime text NOT NULL,
 size integer NOT NULL,
 sha256 text NOT NULL,
 created_ms integer NOT NULL,
 created_by text NOT NULL
);
CREATE INDEX inspection_photo_reservation ON inspection_photos(reservation_id);
CREATE TABLE unit_safety_holds (
 id text PRIMARY KEY NOT NULL,
 unit_id text NOT NULL,
 inspection_id text NOT NULL DEFAULT '',
 reason text NOT NULL,
 created_ms integer NOT NULL,
 created_by text NOT NULL,
 resolved_ms integer,
 resolved_by text NOT NULL DEFAULT '',
 resolution text NOT NULL DEFAULT ''
);
CREATE INDEX safety_hold_unit ON unit_safety_holds(unit_id,resolved_ms);
CREATE TABLE operation_records (
 id text PRIMARY KEY NOT NULL,
 reservation_id text NOT NULL DEFAULT '',
 unit_id text NOT NULL DEFAULT '',
 kind text NOT NULL,
 title text NOT NULL,
 notes text NOT NULL,
 amount_cents integer,
 created_ms integer NOT NULL,
 created_by text NOT NULL
);
CREATE INDEX operation_record_unit ON operation_records(unit_id,created_ms);
CREATE TABLE admin_audit_events (
 id text PRIMARY KEY NOT NULL,
 actor text NOT NULL,
 action text NOT NULL,
 entity_id text NOT NULL,
 payload text NOT NULL,
 created_ms integer NOT NULL
);
CREATE INDEX admin_audit_entity ON admin_audit_events(entity_id,created_ms);
CREATE TABLE inspection_archives (
 inspection_id text PRIMARY KEY NOT NULL,
 status text NOT NULL DEFAULT 'pending',
 attempts integer NOT NULL DEFAULT 0,
 lease_ms integer NOT NULL DEFAULT 0,
 provider_id text NOT NULL DEFAULT '',
 updated_ms integer NOT NULL
);
CREATE TRIGGER rental_inspection_immutable_update BEFORE UPDATE ON rental_inspections BEGIN SELECT RAISE(ABORT,'INSPECTION_IMMUTABLE'); END;
CREATE TRIGGER operation_record_immutable_update BEFORE UPDATE ON operation_records BEGIN SELECT RAISE(ABORT,'OPERATION_RECORD_IMMUTABLE'); END;
CREATE TRIGGER audit_event_immutable_update BEFORE UPDATE ON admin_audit_events BEGIN SELECT RAISE(ABORT,'AUDIT_EVENT_IMMUTABLE'); END;

--> statement-breakpoint
CREATE TABLE customers (
 id text PRIMARY KEY NOT NULL,
 phone text NOT NULL,
 password_hash text NOT NULL,
 phone_verified integer NOT NULL DEFAULT 0,
 service_consent integer NOT NULL DEFAULT 0,
 marketing_consent integer NOT NULL DEFAULT 0,
 service_consent_ms integer,
 marketing_consent_ms integer,
 consent_version text NOT NULL DEFAULT 'customer-whatsapp-v1',
 created_ms integer NOT NULL,
 updated_ms integer NOT NULL,
 disabled integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX customer_phone_unique ON customers(phone);
CREATE TABLE customer_sessions (
 token_hash text PRIMARY KEY NOT NULL,
 customer_id text NOT NULL,
 expires_ms integer NOT NULL,
 created_ms integer NOT NULL
);
CREATE INDEX customer_session_owner ON customer_sessions(customer_id);
CREATE INDEX customer_session_expiration ON customer_sessions(expires_ms);
CREATE TABLE customer_auth_limits (
 key_hash text PRIMARY KEY NOT NULL,
 window_ms integer NOT NULL,
 count integer NOT NULL
);
CREATE TABLE customer_phone_challenges (
 customer_id text PRIMARY KEY NOT NULL,
 nonce text NOT NULL,
 code_hash text NOT NULL,
 requested_ms integer NOT NULL,
 expires_ms integer NOT NULL,
 attempts integer NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'sending'
);
CREATE TABLE customer_password_resets (
 customer_id text PRIMARY KEY NOT NULL,
 nonce text NOT NULL,
 code_hash text NOT NULL,
 requested_ms integer NOT NULL,
 expires_ms integer NOT NULL,
 attempts integer NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'sending'
);

--> statement-breakpoint
CREATE TABLE customer_notifications (
 id text PRIMARY KEY NOT NULL,
 customer_id text NOT NULL,
 reservation_id text NOT NULL DEFAULT '',
 kind text NOT NULL,
 event_key text NOT NULL,
 scheduled_ms integer NOT NULL,
 payload text NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'pending',
 attempts integer NOT NULL DEFAULT 0,
 lease_ms integer NOT NULL DEFAULT 0,
 created_ms integer NOT NULL,
 updated_ms integer NOT NULL,
 provider_id text NOT NULL DEFAULT '',
 last_reason text NOT NULL DEFAULT '',
 submitted_ms integer
);
CREATE UNIQUE INDEX customer_notification_event ON customer_notifications(event_key);
CREATE INDEX customer_notification_due ON customer_notifications(status,scheduled_ms);
CREATE INDEX customer_notification_customer ON customer_notifications(customer_id,kind,created_ms);

--> statement-breakpoint
ALTER TABLE reservations ADD customer_id text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE reservations ADD actual_start_ms integer;
--> statement-breakpoint
ALTER TABLE reservations ADD actual_end_ms integer;
--> statement-breakpoint
ALTER TABLE reservations ADD due_ms integer;
--> statement-breakpoint
ALTER TABLE reservations ADD late_fee_cents integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE reservations ADD late_fee_status text NOT NULL DEFAULT 'pending_review';
--> statement-breakpoint
CREATE INDEX reservation_customer_start ON reservations (customer_id,start_ms);
--> statement-breakpoint
DROP TRIGGER IF EXISTS unit_active_reservation_guard;
--> statement-breakpoint
CREATE TRIGGER unit_active_reservation_guard BEFORE UPDATE OF status,color,model_id ON units
WHEN (NEW.status <> 'available' OR NEW.color <> OLD.color OR NEW.model_id <> OLD.model_id)
 AND EXISTS (SELECT 1 FROM reservations r WHERE r.unit_id=OLD.id
 AND (r.status='rented' OR (r.status IN ('reserved','preparing','ready')
 AND COALESCE(r.due_ms,r.end_ms)>CAST(strftime('%s','now') AS INTEGER)*1000)))
BEGIN SELECT RAISE(ABORT,'UNIT_ACTIVE_RESERVATION'); END;

--> statement-breakpoint
CREATE TRIGGER fleet_block_insert_guard BEFORE INSERT ON blocks WHEN EXISTS (SELECT 1 FROM reservations r WHERE r.unit_id=NEW.unit_id AND ((r.status='rented' AND COALESCE(r.due_ms,r.end_ms)<=CAST(strftime('%s','now') AS INTEGER)*1000) OR (r.status IN ('reserved','preparing','ready','rented') AND COALESCE(r.actual_start_ms,r.start_ms)<(NEW.end_ms+0) AND (COALESCE(r.due_ms,r.end_ms)+COALESCE(CASE WHEN json_valid(r.terms_snapshot) THEN json_extract(r.terms_snapshot,'$.preparation_buffer_ms') END,10800000))>NEW.start_ms) OR (r.status='returned' AND r.actual_end_ms IS NOT NULL AND r.actual_end_ms<(NEW.end_ms+0) AND (r.actual_end_ms+COALESCE(CASE WHEN json_valid(r.terms_snapshot) THEN json_extract(r.terms_snapshot,'$.preparation_buffer_ms') END,10800000))>NEW.start_ms))) BEGIN SELECT RAISE(ABORT,'FLEET_BLOCK_CONFLICT'); END;
--> statement-breakpoint
CREATE TRIGGER fleet_block_update_guard BEFORE UPDATE OF unit_id,start_ms,end_ms ON blocks WHEN EXISTS (SELECT 1 FROM reservations r WHERE r.unit_id=NEW.unit_id AND ((r.status='rented' AND COALESCE(r.due_ms,r.end_ms)<=CAST(strftime('%s','now') AS INTEGER)*1000) OR (r.status IN ('reserved','preparing','ready','rented') AND COALESCE(r.actual_start_ms,r.start_ms)<(NEW.end_ms+0) AND (COALESCE(r.due_ms,r.end_ms)+COALESCE(CASE WHEN json_valid(r.terms_snapshot) THEN json_extract(r.terms_snapshot,'$.preparation_buffer_ms') END,10800000))>NEW.start_ms) OR (r.status='returned' AND r.actual_end_ms IS NOT NULL AND r.actual_end_ms<(NEW.end_ms+0) AND (r.actual_end_ms+COALESCE(CASE WHEN json_valid(r.terms_snapshot) THEN json_extract(r.terms_snapshot,'$.preparation_buffer_ms') END,10800000))>NEW.start_ms))) BEGIN SELECT RAISE(ABORT,'FLEET_BLOCK_CONFLICT'); END;
--> statement-breakpoint
CREATE TRIGGER fleet_new_allocation_guard BEFORE INSERT ON reservations
WHEN json_valid(NEW.terms_snapshot) AND json_extract(NEW.terms_snapshot,'$.preparation_buffer_ms') IS NOT NULL
BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM units u WHERE u.id=NEW.unit_id AND u.status='available') OR EXISTS (SELECT 1 FROM unit_safety_holds h WHERE h.unit_id=NEW.unit_id AND h.resolved_ms IS NULL) THEN RAISE(ABORT,'UNIT_SAFETY_HOLD') END;
 SELECT CASE WHEN EXISTS (SELECT 1 FROM reservations r WHERE r.unit_id=NEW.unit_id AND ((r.status='rented' AND COALESCE(r.due_ms,r.end_ms)<=CAST(strftime('%s','now') AS INTEGER)*1000) OR (r.status IN ('reserved','preparing','ready','rented') AND COALESCE(r.actual_start_ms,r.start_ms)<(NEW.end_ms+COALESCE(json_extract(NEW.terms_snapshot,'$.preparation_buffer_ms'),10800000)) AND (COALESCE(r.due_ms,r.end_ms)+COALESCE(CASE WHEN json_valid(r.terms_snapshot) THEN json_extract(r.terms_snapshot,'$.preparation_buffer_ms') END,10800000))>NEW.start_ms) OR (r.status='returned' AND r.actual_end_ms IS NOT NULL AND r.actual_end_ms<(NEW.end_ms+COALESCE(json_extract(NEW.terms_snapshot,'$.preparation_buffer_ms'),10800000)) AND (r.actual_end_ms+COALESCE(CASE WHEN json_valid(r.terms_snapshot) THEN json_extract(r.terms_snapshot,'$.preparation_buffer_ms') END,10800000))>NEW.start_ms))) OR EXISTS (SELECT 1 FROM blocks b WHERE b.unit_id=NEW.unit_id AND b.start_ms<(NEW.end_ms+COALESCE(json_extract(NEW.terms_snapshot,'$.preparation_buffer_ms'),10800000)) AND b.end_ms>NEW.start_ms) THEN RAISE(ABORT,'FLEET_ALLOCATION_CONFLICT') END;
END;
--> statement-breakpoint
CREATE TRIGGER fleet_pickup_guard BEFORE UPDATE OF status,actual_start_ms,due_ms ON reservations
WHEN NEW.status='rented' AND OLD.status<>'rented' AND NEW.actual_start_ms IS NOT NULL
BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM units u WHERE u.id=NEW.unit_id AND u.status='available') OR EXISTS (SELECT 1 FROM unit_safety_holds h WHERE h.unit_id=NEW.unit_id AND h.resolved_ms IS NULL) THEN RAISE(ABORT,'UNIT_SAFETY_HOLD') END;
 SELECT CASE WHEN EXISTS (SELECT 1 FROM reservations r WHERE r.unit_id=NEW.unit_id AND r.id<>NEW.id AND ((r.status='rented' AND COALESCE(r.due_ms,r.end_ms)<=CAST(strftime('%s','now') AS INTEGER)*1000) OR (r.status IN ('reserved','preparing','ready','rented') AND COALESCE(r.actual_start_ms,r.start_ms)<(NEW.due_ms+10800000) AND (COALESCE(r.due_ms,r.end_ms)+COALESCE(CASE WHEN json_valid(r.terms_snapshot) THEN json_extract(r.terms_snapshot,'$.preparation_buffer_ms') END,10800000))>NEW.actual_start_ms) OR (r.status='returned' AND r.actual_end_ms IS NOT NULL AND r.actual_end_ms<(NEW.due_ms+10800000) AND (r.actual_end_ms+COALESCE(CASE WHEN json_valid(r.terms_snapshot) THEN json_extract(r.terms_snapshot,'$.preparation_buffer_ms') END,10800000))>NEW.actual_start_ms))) OR EXISTS (SELECT 1 FROM blocks b WHERE b.unit_id=NEW.unit_id AND b.start_ms<(NEW.due_ms+10800000) AND b.end_ms>NEW.actual_start_ms) THEN RAISE(ABORT,'FLEET_PICKUP_CONFLICT') END;
END;

--> statement-breakpoint
-- Owner-defined operating limit; manufacturer manual remains unchanged.
UPDATE rental_models SET spec=json_set(spec,'$.manufacturer_capacity',150,'$.capacity',120,'$.capacity_exclusive',json('true'),'$.commercial_minimum_age',16,'$.commercial_passengers',2,'$.commercial_policy_source','Definições operacionais da CaloriMob em 29/10/2026; enquadramento legal pendente de validação documental.') WHERE id='t1' AND brand='New e-bike' AND json_valid(spec);
