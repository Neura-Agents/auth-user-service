import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { TokenSet } from 'openid-client';
import { ENV } from '../config/env.config';

export class AuthController {
    static getLogin(req: Request, res: Response): void {
        try {
            const idpHint = req.query.idp as string;
            const action = req.query.action as string;
            const theme = req.query.theme as string;

            const { authUrl, codeVerifier } = AuthService.getAuthUrl(req, idpHint, action, theme);

            // Capture redirect_to from query or default to frontend URL
            const redirectTo = req.query.redirect_to as string;
            if (redirectTo) {
                req.session.redirect_to = redirectTo;
            }

            // Store the verifier in the session for callbacks
            req.session.code_verifier = codeVerifier;

            // Explicitly save the session before redirecting to avoid race conditions
            req.session.save((err) => {
                if (err) {
                    console.error('Failed to save session for login:', err);
                    res.status(500).send('Login initiation failed');
                    return;
                }
                res.redirect(authUrl);
            });
        } catch (error) {
            console.error('Login initiation failed:', error);
            res.status(500).send('Login initiation failed');
        }
    }

    static async getCallback(req: Request, res: Response): Promise<void> {
        try {
            const codeVerifier = req.session.code_verifier;
            if (!codeVerifier) {
                res.status(400).send('Missing code_verifier in session');
                return;
            }

            const { tokenSet, userInfo } = await AuthService.handleCallback(req, codeVerifier);

            req.session.tokens = tokenSet;
            req.session.user = userInfo;

            // JIT Synchronize user to our database
            try {
                await AuthService.syncUserJIT(userInfo);
            } catch (syncError) {
                console.error('JIT Sync failed during callback:', syncError);
            }

            console.log(`✅ Session established for user: ${userInfo.preferred_username || userInfo.sub}`);

            // Explicitly save the session before redirecting
            req.session.save((err) => {
                if (err) {
                    console.error('Failed to save session:', err);
                    res.status(500).send('Login failed');
                    return;
                }

                // Redirect to the original page or the frontend home
                const redirectTo = req.session.redirect_to || ENV.FRONTEND_URL;
                // Clear it from the session after use
                delete req.session.redirect_to;
                
                res.redirect(redirectTo);
            });
        } catch (error) {
            console.error('Callback error:', error);
            res.status(500).send('Authentication failed');
        }
    }

    static async getUser(req: Request, res: Response): Promise<void> {
        if (!req.session.user || !req.session.tokens) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }

        const tokenSet = new TokenSet(req.session.tokens);
        if (tokenSet.expired()) {
            console.log('Token expired, attempting auto-refresh in /auth/user...');
            try {
                if (!tokenSet.refresh_token) {
                    throw new Error('No refresh token available');
                }
                const refreshedTokens = await AuthService.refreshToken(tokenSet.refresh_token);
                req.session.tokens = new TokenSet({
                    ...req.session.tokens,
                    ...refreshedTokens
                });
                res.json({
                    user: {
                        ...req.session.user,
                        idps: req.session.user.idp_links || []
                    },
                    token: refreshedTokens.access_token
                });
                return;
            } catch (error) {
                console.error('Auto-refresh failed in /auth/user:', error);
                req.session.destroy(() => { });
                res.status(401).json({ error: 'Session expired' });
                return;
            }
        }

        res.json({
            user: {
                ...req.session.user,
                idps: req.session.user.idp_links || []
            },
            token: req.session.tokens.access_token
        });
    }

    static async getRefresh(req: Request, res: Response): Promise<void> {
        if (!req.session.tokens || !req.session.tokens.refresh_token) {
            res.status(401).json({ error: 'No refresh token available' });
            return;
        }

        try {
            const refreshedTokens = await AuthService.refreshToken(req.session.tokens.refresh_token);
            req.session.tokens = new TokenSet({
                ...req.session.tokens,
                ...refreshedTokens
            });
            res.json({
                token: refreshedTokens.access_token
            });
        } catch (error) {
            console.error('Refresh token error:', error);
            res.status(401).json({ error: 'Failed to refresh token' });
        }
    }

    static getLogout(req: Request, res: Response): void {
        const redirectTo = req.query.redirect_to as string;
        const theme = req.query.theme as string;
        
        // Instead of carrying over the 'redirect_to' from the logout into the next login,
        // we determine if we should default back to the dashboard (8005) for the next session.
        // If the user was on the public site (7999), we might want them to stay there, 
        // but if they are logging out/in, they likely want the dashboard.
        const dashboardUrl = ENV.FRONTEND_URL; // This is now http://localhost:8005
        
        // Final landing URI for Keycloak's post_logout_redirect.
        // We point back to our login screen, but ensure its 'redirect_to' is the dashboard.
        // Also pass the theme back to the post-logout redirect landing page (which is our /login hint)
        const loginUrl = `${ENV.KEYCLOAK.KEYCLOAK_REDIRECT_URI.replace('/callback', '/login')}?redirect_to=${encodeURIComponent(dashboardUrl)}${theme ? `&theme=${theme}` : ''}`;
        
        const postLogoutUri = loginUrl;

        if (!req.session.tokens || !req.session.tokens.id_token) {
            res.redirect(postLogoutUri);
            return;
        }
        const logoutUrl = AuthService.getLogoutUrl(req.session.tokens.id_token, postLogoutUri, theme);
        req.session.destroy(() => { });
        res.redirect(logoutUrl);
    }

    static async postLocalLogin(req: Request, res: Response): Promise<void> {
        const { username, password } = req.body;
        if (!username || !password) {
            res.status(400).json({ error: 'Username and password required' });
            return;
        }

        try {
            const { tokenSet, userInfo } = await AuthService.localLogin(username, password);

            req.session.tokens = tokenSet;
            req.session.user = userInfo;

            // JIT Synchronize user to our database
            try {
                await AuthService.syncUserJIT(userInfo);
            } catch (syncError) {
                console.error('JIT Sync failed during local login:', syncError);
            }

            res.json({ success: true, user: userInfo, token: tokenSet.access_token });
        } catch (error: any) {
            res.status(401).json({ error: error.message || 'Invalid username or password' });
        }
    }

    static async postLocalRegister(req: Request, res: Response): Promise<void> {
        const { username, password, email, firstName, lastName } = req.body;
        if (!username || !password || !email) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }

        try {
            await AuthService.localRegister({ username, password, email, firstName, lastName });
            res.json({ success: true, message: 'User registered successfully!' });
        } catch (error: any) {
            res.status(400).json({
                error: 'Registration failed: ' + (error.response?.data?.errorMessage || error.message)
            });
        }
    }
}
