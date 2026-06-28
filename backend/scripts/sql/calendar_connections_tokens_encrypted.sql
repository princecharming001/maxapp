-- Additive migration: add tokens_encrypted (LargeBinary) to calendar_connections.
-- The legacy plaintext tokens column is NOT dropped yet; dual-read in the ORM
-- handles both old and new rows until a backfill is run.
ALTER TABLE calendar_connections
    ADD COLUMN IF NOT EXISTS tokens_encrypted BYTEA;
