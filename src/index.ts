import express from 'express';
import session from 'express-session';
import { ENV } from './config/env.config';
import { initKeycloak } from './config/keycloak.config';
import { initDb } from './config/db.config';

import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';

const app = express();

const isProduction = process.env.NODE_ENV === 'production' || ENV.FRONTEND_URL.includes('wormlabs.in');

app.use(express.json());

// Trust all proxy headers (Coolify/Traefik/Kong)
// 'true' trusts all, which is usually fine in container environments
app.set('trust proxy', true); 

app.use(
    session({
        name: 'neura_sid',
        secret: ENV.SESSION_SECRET || 'fallback-secret-for-dev',
        resave: true, // Set to true to ensure session is refreshed on every request
        saveUninitialized: true,
        proxy: true,
        cookie: {
            httpOnly: true,
            // In production, we MUST have secure: true, but if the proxy is misconfigured
            // and reporting 'http', the cookie won't be set. 
            // We force it to true if we're on the production domain.
            secure: isProduction, 
            sameSite: isProduction ? 'none' : 'lax',
            path: '/',
            domain: isProduction ? '.wormlabs.in' : undefined,
            maxAge: 24 * 60 * 60 * 1000
        }
    })
);

// Enhanced debug middleware
app.use((req, res, next) => {
    const now = new Date().toISOString();
    
    // Workaround for misconfigured proxies: if it's our prod domain, it's https.
    if (isProduction && !req.secure) {
        // We don't overwrite req.secure directly as it's a getter, 
        // but this log helps us confirm the mismatch.
        console.warn(`[${now}] ⚠️ WARNING: Request on ${req.headers.host} perceived as INSECURE (http) but isProduction is true.`);
    }

    console.log(`[${now}] ${req.method} ${req.url}`);
    console.log(`[${now}] Session ID: ${req.sessionID}`);
    console.log(`[${now}] Proto: ${req.headers['x-forwarded-proto']}, Secure: ${req.secure}`);
    
    next();
});

// We define our routers. Assuming the reverse proxy maps /backend/auth -> /backend/auth
app.use('/backend/auth', authRoutes);
app.use('/backend/api/users', userRoutes);

export { app };

if (process.env.NODE_ENV !== 'test') {
    const startServer = async () => {
        try {
            await initDb();
            await initKeycloak();

            app.listen(ENV.PORT, () => {
                console.log(`Backend Auth server running on port ${ENV.PORT}`);
            });
        } catch (error) {
            console.error('Failed to start server:', error);
            process.exit(1);
        }
    };

    startServer();
}
