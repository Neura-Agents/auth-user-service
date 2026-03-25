# Auth & User Management Service

A robust, TypeScript-based backend service designed to handle authentication and user state management for the AgenticAI platform. It integrates seamlessly with Keycloak via OpenID Connect (OIDC) and maintains session state for secure, cross-service communication.

---

## 🚀 Key Features

- **OIDC Integration**: Full support for Keycloak authentication flows.
- **Session Management**: Secure, session-based authentication using `express-session`.
- **User Management**: Unified API for retrieving and managing user-specific data.
- **Proxy Optimized**: Pre-configured to work behind a reverse proxy (e.g., Kong Gateway) with header trust and cookie security settings.
- **TypeScript First**: Fully typed codebase for reliability and developer productivity.

---

## 🛠 Technology Stack

- **Core**: Node.js & Express
- **Language**: TypeScript
- **Auth**: `openid-client` & `express-session`
- **Database**: PostgreSQL (`pg`)
- **HTTP Client**: Axios
- **Developer Tools**: Nodemon, TS-Node

---

## ⚙️ Environment Variables

The service relies on the following environment variables. You can find their defaults in `src/config/env.config.ts`.

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | Port number the service listens on | `3000` |
| `FRONTEND_URL` | The URL of the frontend application | `http://localhost:8080` |
| `SESSION_SECRET` | Secret key for signing sessions | `super-secret-key-12345` |
| `KEYCLOAK_ISSUER_URL` | Internal Keycloak issuer URL | `http://keycloak:8080/realms/agentic-ai` |
| `KEYCLOAK_PUBLIC_ISSUER_URL`| Public Keycloak issuer URL accessed from browser | `http://localhost:8081/realms/agentic-ai` |
| `KEYCLOAK_CLIENT_ID` | Keycloak client identifier | `auth-client` |
| `KEYCLOAK_CLIENT_SECRET` | Keycloak client secret | _None (must be set)_ |
| `REDIRECT_URI` | Public callback URL for OIDC | `http://localhost:8000/backend/auth/callback` |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_USER` | PostgreSQL username | `postgres` |
| `DB_PASSWORD` | PostgreSQL password | `postgres` |
| `DB_NAME` | PostgreSQL database name | `neura-agents-platform` |

---

## 📥 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- PostgreSQL
- Keycloak instance pre-configured with the `agentic-ai` realm.

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file in the root directory (using the variables listed above).

### Development

Run the service in development mode with hot-reloading:
```bash
npm run dev
```

### Production

1. Build the TypeScript source:
   ```bash
   npm run build
   ```

2. Start the compiled JavaScript:
   ```bash
   npm start
   ```

---

## 🏗 Architecture

The service follows a standard layered architecture:

- **`src/index.ts`**: Main entry point, sets up middleware and routes.
- **`src/config/`**: Centralized configuration management and library initializers (DB, Keycloak).
- **`src/routes/`**: API endpoint definitions (Auth & User).
- **`src/controllers/`**: Logic handlers for incoming requests.
- **`src/services/`**: Business logic layer (e.g., interacting with Keycloak Admin API).
- **`src/models/`**: Database schema and data persistence logic.
- **`src/middlewares/`**: Custom middleware (e.g., authentication guards).

---

## 🔒 Security

- **Session Cookies**: Configured with `httpOnly: true` and `sameSite: 'lax'` for protection against XSS and CSRF.
- **Proxy Trust**: Explicitly sets `trust proxy: 1` to correctly handle `X-Forwarded-*` headers when running behind Kong.
- **OIDC Validation**: Strict issuer and token validation via the `openid-client` library.
