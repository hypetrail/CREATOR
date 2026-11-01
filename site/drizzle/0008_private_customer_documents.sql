CREATE TABLE customer_profiles (
 customer_id text PRIMARY KEY NOT NULL,
 envelope text NOT NULL,
 updated_ms integer NOT NULL
);
CREATE TABLE reservation_customer_data (
 reservation_id text PRIMARY KEY NOT NULL,
 customer_id text NOT NULL DEFAULT '',
 envelope text NOT NULL,
 created_ms integer NOT NULL
);
CREATE INDEX reservation_customer_data_owner ON reservation_customer_data(customer_id);
CREATE TABLE reservation_private_documents (
 id text PRIMARY KEY NOT NULL,
 reservation_id text NOT NULL,
 kind text NOT NULL,
 event_key text NOT NULL,
 storage_key text NOT NULL,
 sha256 text NOT NULL,
 created_ms integer NOT NULL,
 document_version text NOT NULL
);
CREATE UNIQUE INDEX private_document_event ON reservation_private_documents(event_key);
CREATE INDEX private_document_reservation ON reservation_private_documents(reservation_id,created_ms);
CREATE TRIGGER reservation_customer_data_immutable BEFORE UPDATE ON reservation_customer_data BEGIN SELECT RAISE(ABORT,'RESERVATION_CUSTOMER_IMMUTABLE'); END;
CREATE TRIGGER reservation_document_metadata_immutable BEFORE UPDATE ON reservation_private_documents BEGIN SELECT RAISE(ABORT,'RESERVATION_DOCUMENT_IMMUTABLE'); END;
