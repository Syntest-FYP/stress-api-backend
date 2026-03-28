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
