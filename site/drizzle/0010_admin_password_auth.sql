CREATE TABLE admin_credentials (
 id text PRIMARY KEY NOT NULL CHECK (id = 'owner'),
 password_hash text NOT NULL,
 version text NOT NULL,
 created_ms integer NOT NULL,
 updated_ms integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE admin_sessions (
 token_hash text PRIMARY KEY NOT NULL,
 credential_version text NOT NULL,
 created_ms integer NOT NULL,
 expires_ms integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX admin_session_expiry ON admin_sessions(expires_ms);
