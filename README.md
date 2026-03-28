# LoadSync Backend - StressAPI

Load testing automation with AI-driven test generation and analysis. Built with Node.js, TypeScript, Express, PostgreSQL, Redis, and integrated with n8n and K6.
### Currently implemented with Node.js (tentative — may migrate to Python FastAPI if performance or flexibility requires).

## Features

- REST API with JWT authentication
- AI agents for test generation, execution, and analysis
- Natural language to K6 test conversion
- Test execution using K6
- Basic result reporting
- PostgreSQL and Redis for data storage
- Simple n8n workflow integration
-  Modular agentic AI architecture for generation, execution, and analysis


## Getting Started

### Prerequisites

- Node.js (v18+)
- Docker and Docker Compose
- OpenAI API Key

### PostgreSQL schema

After `docker compose up -d`, create tables once:

```bash
npm run db:init
```

This runs `init-db.sql` (core tables including `test_suites`) plus migrations from `stress-api-ai/migrations/`. **Warning:** `init-db.sql` drops and recreates those tables; do not run on a database you need to keep.
