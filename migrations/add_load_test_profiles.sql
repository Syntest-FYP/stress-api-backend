-- Migration: Add load_test_profiles table for load testing module
-- Run after init-db.sql

CREATE TABLE IF NOT EXISTS load_test_profiles (
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

CREATE INDEX IF NOT EXISTS idx_load_test_profiles_user_id ON load_test_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_load_test_profiles_suite_id ON load_test_profiles(suite_id);
CREATE INDEX IF NOT EXISTS idx_load_test_profiles_conversation_id ON load_test_profiles(conversation_id);
CREATE INDEX IF NOT EXISTS idx_load_test_profiles_status ON load_test_profiles(status);
