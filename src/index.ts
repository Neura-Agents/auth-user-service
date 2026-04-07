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
        secret: ENV.SESSION_SECRET,
        resave: false,
        saveUninitialized: true,
        proxy: true,
        cookie: {
            httpOnly: true,
            secure: isProduction, // Set to true for HTTPS in production
            sameSite: 'lax',
            path: '/',
            domain: isProduction ? '.wormlabs.in' : undefined, // Share cookie across all subdomains
        }
    })
);

// Debug middleware to check session state (must be after session middleware)
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    console.log(`Protocol: ${req.protocol}`); // This will tell us if it thinks it's http or https
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log(`Session ID: ${req.sessionID}`);
    console.log('User in session:', req.session?.user ? 'YES' : 'NO');
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
