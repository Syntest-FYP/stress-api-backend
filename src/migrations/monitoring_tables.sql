-- Monitoring Jobs
CREATE TABLE IF NOT EXISTS monitoring_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    suite_id UUID NOT NULL REFERENCES test_suites(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    schedule_interval VARCHAR(50) NOT NULL, -- Cron expression or pre-defined intervals
    target_environment_id INTEGER REFERENCES environments(id) ON DELETE SET NULL,
    test_case_definitions JSONB NOT NULL, -- Array of request/assertion steps
    failure_threshold INTEGER DEFAULT 3,
    consecutive_failures INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    last_run_at TIMESTAMP WITH TIME ZONE,
    next_run_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Monitoring Results
CREATE TABLE IF NOT EXISTS monitoring_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES monitoring_jobs(id) ON DELETE CASCADE,
    triggered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL, -- 'pass', 'fail', 'error'
    latency_ms INTEGER,
    response_details JSONB, -- status code, headers, body snippet
    assertion_results JSONB, -- Array of results for each assertion
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Monitoring Alerts
CREATE TABLE IF NOT EXISTS monitoring_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES monitoring_jobs(id) ON DELETE CASCADE,
    result_id UUID REFERENCES monitoring_results(id) ON DELETE SET NULL,
    severity VARCHAR(20) DEFAULT 'critical', -- 'warning', 'critical'
    message TEXT NOT NULL,
    dispatched_channels JSONB, -- e.g., ['email', 'slack']
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mj_user_suite ON monitoring_jobs(user_id, suite_id);
CREATE INDEX IF NOT EXISTS idx_mr_job_id ON monitoring_results(job_id);
CREATE INDEX IF NOT EXISTS idx_ma_job_id ON monitoring_alerts(job_id);

-- Monitoring Suites (named groups of monitoring jobs for workflow-level tracking)
CREATE TABLE IF NOT EXISTS monitoring_suites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    suite_id UUID NOT NULL REFERENCES test_suites(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    job_ids JSONB NOT NULL DEFAULT '[]', -- ordered array of monitoring_job UUIDs
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ms_user_suite ON monitoring_suites(user_id, suite_id);
