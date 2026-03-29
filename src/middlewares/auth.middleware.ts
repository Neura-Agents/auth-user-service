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

export const requirePlatformAdmin = (req: Request, res: Response, next: NextFunction): void => {
    try {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.split(' ')[1];
        
        if (!token) {
            res.status(401).json({ error: 'Unauthorized: Missing token' });
            return;
        }

        const payload = UserService.decodeTokenPayload(token) as any;
        const roles = payload.realm_access?.roles || [];

        if (!roles.includes('platform-admin')) {
            console.warn(`Forbidden access attempt to ${req.url} by ${payload.preferred_username || payload.sub}`);
            res.status(403).json({ error: 'Unauthorized' });
            return;
        }

        next();
    } catch (error) {
        console.error('Role check error:', error);
        res.status(401).json({ error: 'Unauthorized: Invalid token structure' });
    }
};
