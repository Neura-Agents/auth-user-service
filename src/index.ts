import express from 'express';
import session from 'express-session';
import { ENV } from './config/env.config';
import { initKeycloak } from './config/keycloak.config';
import { initDb } from './config/db.config';

import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';

const app = express();

// Trust all proxy headers (Coolify/Traefik and Kong)
app.set('trust proxy', true);

app.use(express.json());

const isProduction = process.env.NODE_ENV === 'production' || ENV.FRONTEND_URL.includes('wormlabs.in');

app.use(
    session({
        name: 'neura_sid',
        secret: ENV.SESSION_SECRET || 'fallback-secret-for-dev',
        resave: false,
        saveUninitialized: false, // Changed to false to avoid empty sessions
        proxy: true,
        cookie: {
            httpOnly: true,
            secure: isProduction, 
            sameSite: isProduction ? 'none' : 'lax', // Use 'none' in prod for cross-subdomain redirects
            path: '/',
            domain: isProduction ? '.wormlabs.in' : undefined,
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        }
    })
);

// Enhanced debug middleware
app.use((req, res, next) => {
    const now = new Date().toISOString();
    console.log(`[${now}] ${req.method} ${req.url}`);
    
    // Check for session presence
    if (!req.session) {
        console.warn(`[${now}] ❌ SESSION MIDDLEWARE NOT WORKING`);
    } else {
        console.log(`[${now}] Session ID: ${req.sessionID}`);
        console.log(`[${now}] Verifier present: ${!!req.session.code_verifier}`);
        console.log(`[${now}] User present: ${!!req.session.user}`);
    }

    // Log proxy headers to verify trust proxy is working
    const proto = req.headers['x-forwarded-proto'];
    const host = req.headers['x-forwarded-host'];
    console.log(`[${now}] Proto: ${proto}, Host: ${host}, Secure: ${req.secure}`);
    
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
