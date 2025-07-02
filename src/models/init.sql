-- Users table (enhanced)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  api_key VARCHAR(255) UNIQUE, -- For API access
  role VARCHAR(20) DEFAULT 'user', -- user, admin
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tests table (enhanced for AI generation)
CREATE TABLE IF NOT EXISTS tests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  natural_language_input TEXT, -- Original user input for AI
  k6_script TEXT, -- Generated K6 script
  target_url VARCHAR(500), -- API endpoint being tested
  test_type VARCHAR(50) DEFAULT 'load', -- load, stress, spike, volume
  configuration JSONB, -- Test parameters (users, duration, etc.)
  tags TEXT[], -- For categorization
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Test scenarios (for complex multi-step tests)
CREATE TABLE IF NOT EXISTS test_scenarios (
  id SERIAL PRIMARY KEY,
  test_id INTEGER REFERENCES tests(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  sequence_order INTEGER NOT NULL,
  http_method VARCHAR(10) NOT NULL, -- GET, POST, PUT, DELETE
  endpoint VARCHAR(500) NOT NULL,
  headers JSONB,
  body JSONB,
  expected_response JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Executions table (enhanced for monitoring)
CREATE TABLE IF NOT EXISTS executions (
  id SERIAL PRIMARY KEY,
  test_id INTEGER REFERENCES tests(id) ON DELETE CASCADE,
  triggered_by VARCHAR(50), -- 'manual', 'n8n', 'api', 'scheduled'
  execution_context JSONB, -- Additional context (n8n workflow id, etc.)
  k6_config JSONB, -- Runtime configuration
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, running, completed, failed, cancelled
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Results table (enhanced for analytics)
CREATE TABLE IF NOT EXISTS results (
  id SERIAL PRIMARY KEY,
  execution_id INTEGER REFERENCES executions(id) ON DELETE CASCADE,
  metric_type VARCHAR(50) NOT NULL, -- 'summary', 'http_req_duration', 'response_time', etc.
  metric_name VARCHAR(100) NOT NULL,
  metric_value NUMERIC,
  metric_unit VARCHAR(20), -- 'ms', 'req/s', 'MB', etc.
  tags JSONB, -- K6 tags for grouping
  timestamp TIMESTAMP NOT NULL,
  raw_data JSONB, -- Full K6 output for this metric
  created_at TIMESTAMP DEFAULT NOW()
);

-- Analysis reports (for AI analysis agent)
CREATE TABLE IF NOT EXISTS analysis_reports (
  id SERIAL PRIMARY KEY,
  execution_id INTEGER REFERENCES executions(id) ON DELETE CASCADE,
  agent_version VARCHAR(50), -- Track which AI model generated this
  summary TEXT NOT NULL,
  insights JSONB, -- Structured insights from AI
  recommendations JSONB, -- AI recommendations
  performance_grade VARCHAR(10), -- A, B, C, D, F
  bottlenecks_identified JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- N8N integrations (for workflow tracking)
CREATE TABLE IF NOT EXISTS n8n_workflows (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  workflow_id VARCHAR(100) NOT NULL, -- n8n workflow identifier
  workflow_name VARCHAR(100),
  test_id INTEGER REFERENCES tests(id), -- Associated test
  webhook_url VARCHAR(500),
  is_active BOOLEAN DEFAULT true,
  configuration JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Agent logs (for debugging AI agents)
CREATE TABLE IF NOT EXISTS agent_logs (
  id SERIAL PRIMARY KEY,
  execution_id INTEGER REFERENCES executions(id),
  agent_type VARCHAR(50) NOT NULL, -- TestGeneration, Execution, Analysis
  agent_action VARCHAR(100) NOT NULL,
  input_data JSONB,
  output_data JSONB,
  processing_time_ms INTEGER,
  status VARCHAR(20) NOT NULL, -- success, error, warning
  error_details TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- API usage tracking (for monitoring and billing)
CREATE TABLE IF NOT EXISTS api_usage (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  endpoint VARCHAR(100) NOT NULL,
  method VARCHAR(10) NOT NULL,
  status_code INTEGER,
  response_time_ms INTEGER,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tests_user_id ON tests(user_id);
CREATE INDEX IF NOT EXISTS idx_tests_created_at ON tests(created_at);
CREATE INDEX IF NOT EXISTS idx_executions_test_id ON executions(test_id);
CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
CREATE INDEX IF NOT EXISTS idx_executions_started_at ON executions(started_at);
CREATE INDEX IF NOT EXISTS idx_results_execution_id ON results(execution_id);
CREATE INDEX IF NOT EXISTS idx_results_metric_type ON results(metric_type);
CREATE INDEX IF NOT EXISTS idx_results_timestamp ON results(timestamp);
CREATE INDEX IF NOT EXISTS idx_analysis_reports_execution_id ON analysis_reports(execution_id);
CREATE INDEX IF NOT EXISTS idx_agent_logs_execution_id ON agent_logs(execution_id);
CREATE INDEX IF NOT EXISTS idx_agent_logs_agent_type ON agent_logs(agent_type);
CREATE INDEX IF NOT EXISTS idx_api_usage_user_id ON api_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_created_at ON api_usage(created_at);