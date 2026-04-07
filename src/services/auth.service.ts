import { Request } from 'express';
import { generators, TokenSet } from 'openid-client';
import { getKeycloakClient } from '../config/keycloak.config';
import { ENV } from '../config/env.config';
import axios from 'axios';
import { UserInfo } from '../models/auth';
import { UserService } from './user.service';

export class AuthService {
    /**
     * Start the authentication flow by generating an auth URL and code_verifier
     */
    static getAuthUrl(req: Request, idpHint?: string, action?: string, theme?: string): { authUrl: string; codeVerifier: string } {
        const keycloakClient = getKeycloakClient();
        const codeVerifier = generators.codeVerifier();
        const codeChallenge = generators.codeChallenge(codeVerifier);

        const params: Record<string, string> = {
            scope: 'openid profile email',
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            redirect_uri: ENV.KEYCLOAK.KEYCLOAK_REDIRECT_URI,
        };

        if (theme) {
            params.ui_theme = theme;
        }

        if (idpHint) {
            if (req.session.tokens) {
                params.kc_action = `idp_link:${idpHint}`;
            } else {
                params.kc_idp_hint = idpHint;
            }
        } else if (action === 'register') {
            params.kc_action = 'REGISTRATION';
        } else if (action === 'UPDATE_PASSWORD') {
            params.kc_action = 'UPDATE_PASSWORD';
        } else if (action === 'UPDATE_PROFILE') {
            params.kc_action = 'UPDATE_PROFILE';
        }

        let authUrl = keycloakClient.authorizationUrl(params);
        
        console.log(`[DEBUG] Received Auth URL from client: ${authUrl}`);

        const publicUrl = new URL(ENV.KEYCLOAK.PUBLIC_ISSUER_URL);
        const internalUrl = new URL(ENV.KEYCLOAK.ISSUER_URL);

        // Robust replacement:
        // 1. Replace the configured internal issuer (from the discovered metadata host)
        authUrl = authUrl.replace(internalUrl.host, publicUrl.host);
        // 2. ALSO replace any variation of localhost or 127.0.0.1 typically used in local development
        authUrl = authUrl.replace('localhost:8081', publicUrl.host)
                         .replace('localhost:8080', publicUrl.host)
                         .replace('127.0.0.1:8081', publicUrl.host)
                         .replace('127.0.0.1:8080', publicUrl.host);
        
        console.log(`[DEBUG] Final Redirecting browser to: ${authUrl}`);

        return { authUrl, codeVerifier };
    }

    /**
     * Handle OIDC Callback returning tokens and user info
     */
    static async handleCallback(req: Request, codeVerifier: string): Promise<{ tokenSet: TokenSet; userInfo: UserInfo }> {
        const keycloakClient = getKeycloakClient();
        const params = keycloakClient.callbackParams(req);
        const tokenSet = await keycloakClient.callback(ENV.KEYCLOAK.KEYCLOAK_REDIRECT_URI, params, {
            code_verifier: codeVerifier,
        });

        // Use the claims from the ID token instead of making a userinfo call
        // This avoids issuer mismatch issues on the internal userinfo endpoint
        const userInfo = tokenSet.claims() as unknown as UserInfo;
        
        return { tokenSet, userInfo };
    }

    /**
     * Refresh logic when access token expires
     */
    static async refreshToken(refreshToken: string): Promise<TokenSet> {
        const keycloakClient = getKeycloakClient();
        const refreshedTokens = await keycloakClient.refresh(refreshToken);
        return refreshedTokens;
    }

    /**
     * Retrieve user info using token
     */
    static async getUserInfo(accessToken: string): Promise<UserInfo> {
        const keycloakClient = getKeycloakClient();
        return await keycloakClient.userinfo(accessToken) as UserInfo;
    }

    /**
     * Logout logic
     */
    static getLogoutUrl(idToken: string, postLogoutRedirectUri: string, theme?: string): string {
        const keycloakClient = getKeycloakClient();
        let logoutUrl = keycloakClient.endSessionUrl({
            id_token_hint: idToken,
            post_logout_redirect_uri: postLogoutRedirectUri,
            ui_theme: theme, // Pass theme to logout as well
        } as any);

        const publicUrl = new URL(ENV.KEYCLOAK.PUBLIC_ISSUER_URL);
        const internalUrl = new URL(ENV.KEYCLOAK.ISSUER_URL);

        // Robust replacement for logout URL to ensure browser can resolve it
        logoutUrl = logoutUrl.replace(internalUrl.host, publicUrl.host);
        logoutUrl = logoutUrl.replace('localhost:8081', publicUrl.host)
                             .replace('localhost:8080', publicUrl.host)
                             .replace('127.0.0.1:8081', publicUrl.host)
                             .replace('127.0.0.1:8080', publicUrl.host);

        return logoutUrl;
    }

    /**
     * Local login via Direct Access Grant
     */
    static async localLogin(username: string, password: string): Promise<{ tokenSet: TokenSet; userInfo: UserInfo }> {
        const tokenUrl = `${ENV.KEYCLOAK.ISSUER_URL}/protocol/openid-connect/token`;
        const params = new URLSearchParams();
        params.append('client_id', ENV.KEYCLOAK.CLIENT_ID);

        if (ENV.KEYCLOAK.CLIENT_SECRET && ENV.KEYCLOAK.CLIENT_SECRET !== '') {
            params.append('client_secret', ENV.KEYCLOAK.CLIENT_SECRET);
        }

        params.append('grant_type', 'password');
        params.append('username', username);
        params.append('password', password);
        params.append('scope', 'openid profile email');

        try {
            const response = await axios.post(tokenUrl, params, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            const tokenSet = new TokenSet(response.data);
            const userInfo = await this.getUserInfo(tokenSet.access_token as string);

            return { tokenSet, userInfo };
        } catch (error: unknown) {
            console.error('Local login failed details:', error);
            throw new Error('Invalid username or password');
        }
    }

    /**
     * Local register using Keycloak Admin API
     */
    static async localRegister(payload: Record<string, string>): Promise<boolean> {
        if (!ENV.KEYCLOAK.ADMIN_CLIENT_SECRET) {
            throw new Error('Admin Client Secret not configured on backend.');
        }

        try {
            // Construct admin base URL from issuer URL
            const issuerUrl = new URL(ENV.KEYCLOAK.ISSUER_URL);
            const adminBaseUrl = `${issuerUrl.protocol}//${issuerUrl.host}`;
            
            const tokenResp = await axios.post(`${adminBaseUrl}/realms/master/protocol/openid-connect/token`, new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: ENV.KEYCLOAK.ADMIN_CLIENT_ID,
                client_secret: ENV.KEYCLOAK.ADMIN_CLIENT_SECRET
            }).toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            const adminToken = tokenResp.data.access_token;

            const createUserUrl = `${adminBaseUrl}/admin/realms/agentic-ai/users`;
            const userPayload = {
                username: payload.username,
                email: payload.email,
                firstName: payload.firstName,
                lastName: payload.lastName,
                enabled: true,
                emailVerified: true,
                credentials: [{ type: 'password', value: payload.password, temporary: false }]
            };

            await axios.post(createUserUrl, userPayload, {
                headers: {
                    'Authorization': `Bearer ${adminToken}`,
                    'Content-Type': 'application/json'
                }
            });

            return true;
        } catch (error: unknown) {
            console.error('Local registration failed details:', error);
            throw error;
        }
    }

    /**
     * Just-In-Time User Sync
     * Syncs the user info to our local database upon successful login
     */
    static async syncUserJIT(userInfo: UserInfo): Promise<void> {
        try {
            // Map UserInfo (from Keycloak) to the format expected by UserService
            // preferred_username is usually the login username
            // sub is the Keycloak UUID
            await UserService.syncUser({
                keycloak_id: userInfo.sub,
                username: userInfo.preferred_username || userInfo.name,
                email: userInfo.email,
                firstName: userInfo.given_name as string || (userInfo.name as string)?.split(' ')[0],
                lastName: userInfo.family_name as string || (userInfo.name as string)?.split(' ').slice(1).join(' ')
            });
            console.log(`JIT Sync: Successfully synced user ${userInfo.sub} to local database`);
        } catch (error: any) {
            console.error(`JIT Sync Error for user ${userInfo.sub}:`, error.message);
            // We don't throw here to avoid blocking the login flow if DB sync fails
        }
    }
}
