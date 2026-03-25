import { Request, Response, NextFunction } from 'express';
import { TokenSet } from 'openid-client';

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
