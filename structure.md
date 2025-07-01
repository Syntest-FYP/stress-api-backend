project-name/
├── src/
│ ├── config/ # Environment config, DB config, etc.
│ │ └── index.js
│ │ └── db.js
│ │ └── logger.js
│ │ └── env.js
│ │
│ ├── controllers/ # Request handlers (no business logic)
│ │ └── user.controller.js
│ │ └── auth.controller.js
│ │
│ ├── services/ # Business logic layer
│ │ └── user.service.js
│ │ └── auth.service.js
│ │
│ ├── models/ # Mongoose or Sequelize models
│ │ └── user.model.js
│ │
│ ├── routes/ # Route definitions and middlewares
│ │ └── user.routes.js
│ │ └── auth.routes.js
│ │
│ ├── middlewares/ # Express middlewares (auth, error handlers, etc.)
│ │ └── error.middleware.js
│ │ └── auth.middleware.js
│ │
│ ├── utils/ # Utility functions/helpers
│ │ └── generateToken.js
│ │ └── validators.js
│ │
│ ├── jobs/ # Cron jobs / background tasks
│ │ └── emailJob.js
│ │
│ ├── app.js # Express app setup (no port listening)
│ └── server.js # Entry point (only starts the server)
│
├── tests/ # Unit and integration tests
│ └── user.test.js
│
├── .env # Environment variables
├── .env.example # Example env file for reference
├── .gitignore
├── package.json
├── README.md
