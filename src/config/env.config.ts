import dotenv from 'dotenv';

dotenv.config();

export const ENV = {
    PORT: process.env.PORT || 3000,
    FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:8080',
    SESSION_SECRET: process.env.SESSION_SECRET || '',
    KEYCLOAK: {
        ISSUER_URL: process.env.KEYCLOAK_ISSUER_URL || 'http://keycloak:8080/realms/agentic-ai',
        PUBLIC_ISSUER_URL: process.env.KEYCLOAK_PUBLIC_ISSUER_URL || 'http://localhost:8081/realms/agentic-ai',
        CLIENT_ID: process.env.KEYCLOAK_CLIENT_ID || 'auth-client',
        CLIENT_SECRET: process.env.KEYCLOAK_CLIENT_SECRET || '',
        ADMIN_CLIENT_ID: process.env.KEYCLOAK_ADMIN_CLIENT_ID || 'admin-cli',
        ADMIN_CLIENT_SECRET: process.env.KEYCLOAK_ADMIN_CLIENT_SECRET || '',
        REDIRECT_URI: process.env.REDIRECT_URI || 'http://localhost:8000/backend/auth/callback',
        KEYCLOAK_REDIRECT_URI: process.env.KEYCLOAK_REDIRECT_URI || 'http://localhost:8000/backend/auth/callback',
    },
    DB: {
        HOST: process.env.DB_HOST || 'localhost',
        PORT: parseInt(process.env.DB_PORT || '5432'),
        USER: process.env.DB_USER || 'postgres',
        PASSWORD: process.env.DB_PASSWORD || 'postgres',
        NAME: process.env.DB_NAME || 'neura-agents-platform',
    }
};
