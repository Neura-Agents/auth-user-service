import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/user.service';

export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
    if (!req.session || !req.session.tokens || !req.session.tokens.access_token) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
    }
    next();
};

export const requireBearerAuth = (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing or invalid Authorization header' });
        return;
    }
    next();
};

export const requirePlatformAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.split(' ')[1];
        
        if (!token) {
            res.status(401).json({ error: 'Unauthorized: Missing token' });
            return;
        }

        // SECURE: Verify the token signature, issuer, and expiration
        const payload = await UserService.verifyToken(token);
        const roles = payload.realm_access?.roles || [];

        if (!roles.includes('platform-admin')) {
            console.warn(`Forbidden access attempt to ${req.url} by ${payload.preferred_username || payload.sub}`);
            res.status(403).json({ error: 'Forbidden: Admin access required' });
            return;
        }

        next();
    } catch (error: any) {
        console.error('PlatformAdmin Verification Error:', error.message);
        res.status(401).json({ error: `Unauthorized: ${error.message}` });
    }
};
