-- Core schema for stress-api-backend (PostgreSQL)
-- WARNING: drops existing public tables with the same names. Backup first if needed.
-- Run: npm run db:init

DROP TABLE IF EXISTS environment_logs CASCADE;
DROP TABLE IF EXISTS environments CASCADE;
DROP TABLE IF EXISTS api_endpoints CASCADE;
DROP TABLE IF EXISTS test_scenarios CASCADE;
DROP TABLE IF EXISTS executions CASCADE;
DROP TABLE IF EXISTS results CASCADE;
DROP TABLE IF EXISTS analysis_reports CASCADE;
DROP TABLE IF EXISTS n8n_workflows CASCADE;
DROP TABLE IF EXISTS agent_logs CASCADE;
DROP TABLE IF EXISTS api_usage CASCADE;
DROP TABLE IF EXISTS tests CASCADE;
DROP TABLE IF EXISTS load_test_profiles CASCADE;
-- stress-api-ai SQLAlchemy ORM (chat / agent persistence)
DROP TABLE IF EXISTS agent_actions CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS analyzed_specs CASCADE;
DROP TABLE IF EXISTS test_cases CASCADE;
DROP TABLE IF EXISTS test_suites CASCADE;

CREATE TABLE test_suites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    version VARCHAR(20) DEFAULT '1.0',
    base_url VARCHAR(255) NOT NULL,
    auth_type VARCHAR(50) DEFAULT 'none',
    tags TEXT[] DEFAULT '{}',
    visibility VARCHAR(20) DEFAULT 'private',
    status VARCHAR(20) DEFAULT 'active',
    category VARCHAR(50),
    total_endpoints INT DEFAULT 0,
    last_tested TIMESTAMP,
    request_count BIGINT DEFAULT 0,
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

CREATE TABLE tests (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  suite_id UUID REFERENCES test_suites(id) ON DELETE SET NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  natural_language_input TEXT,
  k6_script TEXT,
  target_url VARCHAR(500),
  test_type VARCHAR(50) DEFAULT 'load',
  configuration JSONB,
  tags TEXT[],
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE environments (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  suite_id UUID REFERENCES test_suites(id) ON DELETE SET NULL,
  name VARCHAR(100) NOT NULL,
  base_url VARCHAR(500) NOT NULL,
  auth_config JSONB,
  variables JSONB,
  environment_type VARCHAR(20) NOT NULL DEFAULT 'manual',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  is_default BOOLEAN DEFAULT false,
  tags TEXT[],
  created_by UUID,
  last_run_at TIMESTAMP,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE api_endpoints (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  suite_id UUID REFERENCES test_suites(id) ON DELETE CASCADE,
  name VARCHAR(100),
  method VARCHAR(10) NOT NULL,
  path VARCHAR(500) NOT NULL,
  base_url VARCHAR(500),
  headers JSONB,
  query_params JSONB,
  auth_type VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  tags TEXT[],
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE test_scenarios (
  id SERIAL PRIMARY KEY,
  test_id INTEGER REFERENCES tests(id) ON DELETE CASCADE,
  endpoint_id INTEGER REFERENCES api_endpoints(id) ON DELETE SET NULL,
  name VARCHAR(100) NOT NULL,
  sequence_order INTEGER NOT NULL,
  http_method VARCHAR(10) NOT NULL,
  endpoint VARCHAR(500) NOT NULL,
  headers JSONB,
  body JSONB,
  expected_response JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE executions (
  id SERIAL PRIMARY KEY,
  test_id INTEGER REFERENCES tests(id) ON DELETE CASCADE,
  triggered_by VARCHAR(50),
  execution_context JSONB,
  k6_config JSONB,
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  error_message TEXT,
  environment_id INTEGER REFERENCES environments(id) ON DELETE SET NULL,
  environment_snapshot JSONB,
  data_management VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE results (
  id SERIAL PRIMARY KEY,
  execution_id INTEGER REFERENCES executions(id) ON DELETE CASCADE,
  metric_type VARCHAR(50) NOT NULL,
  metric_name VARCHAR(100) NOT NULL,
  metric_value NUMERIC,
  metric_unit VARCHAR(20),
  tags JSONB,
  timestamp TIMESTAMP NOT NULL,
  raw_data JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE analysis_reports (
  id SERIAL PRIMARY KEY,
  execution_id INTEGER REFERENCES executions(id) ON DELETE CASCADE,
  agent_version VARCHAR(50),
  summary TEXT NOT NULL,
  insights JSONB,
  recommendations JSONB,
  performance_grade VARCHAR(10),
  bottlenecks_identified JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE agent_logs (
  id SERIAL PRIMARY KEY,
  execution_id INTEGER REFERENCES executions(id),
  agent_type VARCHAR(50) NOT NULL,
  agent_action VARCHAR(100) NOT NULL,
  input_data JSONB,
  output_data JSONB,
  processing_time_ms INTEGER,
  status VARCHAR(20) NOT NULL,
  error_details TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE n8n_workflows (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  workflow_id VARCHAR(100) NOT NULL,
  workflow_name VARCHAR(100),
  test_id INTEGER REFERENCES tests(id),
  webhook_url VARCHAR(500),
  is_active BOOLEAN DEFAULT true,
  configuration JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE environment_logs (
  id SERIAL PRIMARY KEY,
  environment_id INTEGER REFERENCES environments(id) ON DELETE CASCADE,
  user_id UUID,
  action VARCHAR(100) NOT NULL,
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE spec_analyses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  suite_id UUID NOT NULL,
  spec_file TEXT NOT NULL,
  analysis JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE load_test_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  suite_id UUID NOT NULL REFERENCES test_suites(id) ON DELETE CASCADE,
  conversation_id VARCHAR(100),
  profile_type VARCHAR(20) NOT NULL DEFAULT 'ramp_up',
  max_vus INTEGER DEFAULT 100,
  profile_config JSONB,
  k6_script TEXT,
  result_data JSONB,
  status VARCHAR(30) DEFAULT 'pending',
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE api_usage (
  id SERIAL PRIMARY KEY,
  user_id UUID,
  endpoint VARCHAR(100) NOT NULL,
  method VARCHAR(10) NOT NULL,
  status_code INTEGER,
  response_time_ms INTEGER,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tables used by stress-api-ai (app/models/models.py) — must match SQLAlchemy models
CREATE TABLE conversations (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  suite_id VARCHAR(255),
  title VARCHAR(500),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE messages (
  id VARCHAR(255) PRIMARY KEY,
  conv_id VARCHAR(255) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE agent_actions (
  id VARCHAR(255) PRIMARY KEY,
  msg_id VARCHAR(255) NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  tool_name VARCHAR(255) NOT NULL,
  input JSONB,
  output JSONB,
  status VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE analyzed_specs (
  id VARCHAR(255) PRIMARY KEY,
  spec_data JSONB NOT NULL,
  analysis_result JSONB,
  analyzed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE test_cases (
  id VARCHAR(255) PRIMARY KEY,
  endpoint_id VARCHAR(255),
  test_data JSONB NOT NULL,
  created_by_agent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tests_user_id ON tests(user_id);
CREATE INDEX idx_tests_created_at ON tests(created_at);
CREATE INDEX idx_executions_test_id ON executions(test_id);
CREATE INDEX idx_executions_status ON executions(status);
CREATE INDEX idx_executions_started_at ON executions(started_at);
CREATE INDEX idx_results_execution_id ON results(execution_id);
CREATE INDEX idx_results_metric_type ON results(metric_type);
CREATE INDEX idx_results_timestamp ON results(timestamp);
CREATE INDEX idx_analysis_reports_execution_id ON analysis_reports(execution_id);
CREATE INDEX idx_agent_logs_execution_id ON agent_logs(execution_id);
CREATE INDEX idx_agent_logs_agent_type ON agent_logs(agent_type);
CREATE INDEX idx_api_usage_user_id ON api_usage(user_id);
CREATE INDEX idx_api_usage_created_at ON api_usage(created_at);
CREATE INDEX idx_env_user_id ON environments(user_id);
CREATE INDEX idx_env_status ON environments(status);
CREATE INDEX idx_env_is_default ON environments(user_id, is_default) WHERE is_default = true;
CREATE INDEX idx_env_logs_env_id ON environment_logs(environment_id);
CREATE INDEX idx_suites_user_id ON test_suites(user_id);
CREATE INDEX idx_tests_suite_id ON tests(suite_id);
CREATE INDEX idx_endpoints_user_id ON api_endpoints(user_id);
CREATE INDEX idx_endpoints_suite_id ON api_endpoints(suite_id);
CREATE INDEX idx_scenarios_endpoint_id ON test_scenarios(endpoint_id);
CREATE INDEX idx_env_suite_id ON environments(suite_id);
CREATE INDEX idx_load_test_profiles_user_id ON load_test_profiles(user_id);
CREATE INDEX idx_load_test_profiles_suite_id ON load_test_profiles(suite_id);
CREATE INDEX idx_load_test_profiles_conversation_id ON load_test_profiles(conversation_id);
CREATE INDEX idx_load_test_profiles_status ON load_test_profiles(status);
CREATE INDEX idx_conversations_suite_id ON conversations(suite_id);
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_messages_conv_id ON messages(conv_id);


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
