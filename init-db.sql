-- Passive Monitoring Subsystem Tables

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'log_format') THEN
        CREATE TYPE log_format AS ENUM ('json', 'csv', 'ndjson', 'elk');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ingestion_status') THEN
        CREATE TYPE ingestion_status AS ENUM ('pending', 'processing', 'complete', 'error');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS log_ingestion_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uploaded_by UUID NOT NULL,
    filename VARCHAR(255) NOT NULL,
    format log_format NOT NULL,
    total_records INTEGER DEFAULT 0,
    ingested_at TIMESTAMPTZ,
    status ingestion_status DEFAULT 'pending',
    field_mapping JSONB NULL,
    anomalies_found INTEGER DEFAULT 0,
    error_detail TEXT,
    ai_report TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS log_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES log_ingestion_batches(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL,
    endpoint_path TEXT NOT NULL,
    http_method VARCHAR(10) NOT NULL,
    status_code INTEGER NOT NULL,
    response_time_ms INTEGER NOT NULL,
    user_id VARCHAR(100),
    ip_address VARCHAR(45),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS log_batch_analytics (
    id SERIAL PRIMARY KEY,
    batch_id UUID NOT NULL REFERENCES log_ingestion_batches(id) ON DELETE CASCADE,
    summary_type VARCHAR(50) NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS log_anomalies (
    id SERIAL PRIMARY KEY,
    batch_id UUID NOT NULL REFERENCES log_ingestion_batches(id) ON DELETE CASCADE,
    anomaly_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    endpoint_path TEXT,
    evidence JSONB NOT NULL,
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_log_entries_batch_id ON log_entries(batch_id);
CREATE INDEX IF NOT EXISTS idx_log_entries_status_code ON log_entries(status_code);
CREATE INDEX IF NOT EXISTS idx_log_entries_timestamp ON log_entries(timestamp);
CREATE INDEX IF NOT EXISTS idx_log_entries_endpoint_path ON log_entries(endpoint_path);
CREATE INDEX IF NOT EXISTS idx_log_analytics_batch_id ON log_batch_analytics(batch_id);
CREATE INDEX IF NOT EXISTS idx_log_anomalies_batch_id ON log_anomalies(batch_id);
CREATE INDEX IF NOT EXISTS idx_log_batches_user_id ON log_ingestion_batches(uploaded_by);