-- New reservations keep only their operational WhatsApp contact. Historical
-- encrypted profiles/documents remain intact and are never copied here.
CREATE TABLE reservation_contacts (
 reservation_id text PRIMARY KEY NOT NULL REFERENCES reservations(id),
 name text NOT NULL DEFAULT '',
 phone text NOT NULL,
 revision text NOT NULL,
 consent_version text NOT NULL,
 consent_ms integer NOT NULL,
 revoked_ms integer,
 created_ms integer NOT NULL,
 updated_ms integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE reservation_document_deliveries ADD contact_revision text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE reservation_document_deliveries ADD pending_reason text NOT NULL DEFAULT '';
