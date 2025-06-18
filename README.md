# Stress API

**Stress API** is a modular, backend-only (for now) API load testing engine built in Node.js. It serves as a pre-project foundation for the full-scale final year project, **LoadSync AI** — an intelligent platform for autonomous API performance testing, test generation, and optimization.

---

## Introduction

Stress API allows developers to simulate high-concurrency API traffic and monitor key performance indicators such as response time, success rate, and error distribution. It is built with extensibility and modularity in mind, enabling easy integration with future features like AI-based test case generation, anomaly detection, and multi-protocol support.

This project is not a full-fledged testing tool yet — it is the core engine and API layer that will evolve into a complete intelligent API testing system.
This is a **pre-project** that forms the groundwork for the final system. Development is ongoing as part of the final year project, **LoadSync AI**.

---

## Features

- Basic REST API load testing engine
- Customizable request configurations (method, headers, body, concurrency, delay)
- JSON report output with full test metrics
- Real-time performance statistics returned on test completion
- Modular architecture ready for expansion
- Cleanly structured Express-based backend

---

## Tech Stack

- Node.js
- Express
- Axios (for making concurrent HTTP requests)
- JavaScript (ES6+)
- `perf_hooks` for latency measurement

---

## Roadmap (Can change)

### Phase 1: Core Engine (Completed)
- Load test engine with concurrency and batching
- Configurable API calls (method, headers, body)
- Basic stats reporting

### Phase 2: API Refactoring & Modularity
- Organize backend into services, controllers, routes
- Add input validation and error handling
- Add RESTful API for test triggers and reporting

### Phase 3: AI Test Generation (Upcoming)
- Analyze API logs and suggest test cases
- Basic clustering and pattern detection

### Phase 4: Security & Monitoring
- Add OWASP-based static vulnerability checks
- Real-time monitoring via WebSocket or polling

### Phase 5: Protocol Expansion
- Add support for GraphQL, WebSocket, and gRPC

### Phase 6: Dashboard & Reporting
- Frontend UI with charts and logs
- Exportable reports (JSON, CSV, PDF)

---




