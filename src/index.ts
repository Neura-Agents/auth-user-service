import express from 'express';
import session from 'express-session';
import { ENV } from './config/env.config';
import { initKeycloak } from './config/keycloak.config';
import { initDb } from './config/db.config';

import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';

const app = express();

// Trust the Kong Gateway proxy headers
app.set('trust proxy', 1);

app.use(express.json());

app.use(
    session({
        name: 'neura_sid',
        secret: ENV.SESSION_SECRET,
        resave: false,
        saveUninitialized: true,
        proxy: true,
        cookie: {
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
            path: '/',
        }
    })
);

// Debug middleware to check session state (must be after session middleware)
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
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
