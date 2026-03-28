-- Tables for stress-api-ai SQLAlchemy models (app/models/models.py)
-- Fixes: relation "conversations" does not exist — GET /chat/sessions/:suiteId
-- Safe to run on existing DB (uses IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS conversations (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  suite_id VARCHAR(255),
  title VARCHAR(500),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(255) PRIMARY KEY,
  conv_id VARCHAR(255) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_actions (
  id VARCHAR(255) PRIMARY KEY,
  msg_id VARCHAR(255) NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  tool_name VARCHAR(255) NOT NULL,
  input JSONB,
  output JSONB,
  status VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analyzed_specs (
  id VARCHAR(255) PRIMARY KEY,
  spec_data JSONB NOT NULL,
  analysis_result JSONB,
  analyzed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS test_cases (
  id VARCHAR(255) PRIMARY KEY,
  endpoint_id VARCHAR(255),
  test_data JSONB NOT NULL,
  created_by_agent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_suite_id ON conversations(suite_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conv_id ON messages(conv_id);
