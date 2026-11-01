CREATE TABLE document_versions (id text PRIMARY KEY NOT NULL, approved integer NOT NULL DEFAULT 0, payload text NOT NULL, created_ms integer NOT NULL);
--> statement-breakpoint
CREATE TRIGGER document_version_immutable_update BEFORE UPDATE ON document_versions BEGIN SELECT RAISE(ABORT,'DOCUMENT_VERSION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER document_version_immutable_delete BEFORE DELETE ON document_versions BEGIN SELECT RAISE(ABORT,'DOCUMENT_VERSION_IMMUTABLE'); END;
--> statement-breakpoint
ALTER TABLE reservations ADD external_customer_system text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE reservations ADD external_customer_ref text NOT NULL DEFAULT '';
