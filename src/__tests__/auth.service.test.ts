import { AuthService } from '../services/auth.service';
import { getKeycloakClient } from '../config/keycloak.config';
import { generators, TokenSet } from 'openid-client';
import axios from 'axios';
import { UserService } from '../services/user.service';

import { ENV } from '../config/env.config';

jest.mock('../config/keycloak.config');
ENV.KEYCLOAK.ISSUER_URL = 'http://keycloak-internal:8080/realms/neura-agents';
ENV.KEYCLOAK.PUBLIC_ISSUER_URL = 'http://localhost:8081/realms/neura-agents';
jest.mock('openid-client', () => {
    return {
        generators: {
            codeVerifier: jest.fn(() => 'verifier'),
            codeChallenge: jest.fn(() => 'challenge')
        },
        TokenSet: jest.fn().mockImplementation((data) => ({
            ...data,
            claims: jest.fn().mockReturnValue({ sub: 'user123', preferred_username: 'test' })
        }))
    };
});
jest.mock('axios');
jest.mock('../services/user.service');

describe('AuthService', () => {
    let mockClient: any;

    beforeEach(() => {
        jest.clearAllMocks();
        mockClient = {
            authorizationUrl: jest.fn().mockReturnValue('http://keycloak-internal:8080/auth'),
            callbackParams: jest.fn().mockReturnValue({ code: 'abc' }),
            callback: jest.fn().mockResolvedValue({
                claims: () => ({ sub: 'user123', preferred_username: 'testuser' })
            }),
            refresh: jest.fn().mockResolvedValue({ access_token: 'new-at' }),
            userinfo: jest.fn().mockResolvedValue({ sub: 'user123' }),
            endSessionUrl: jest.fn().mockReturnValue('http://keycloak-internal:8080/logout')
        };
        (getKeycloakClient as jest.Mock).mockReturnValue(mockClient);
    });

    describe('getAuthUrl', () => {
        it('should generate an auth URL and code verifier', () => {
            (generators.codeVerifier as jest.Mock).mockReturnValue('verifier');
            (generators.codeChallenge as jest.Mock).mockReturnValue('challenge');

            const req = { session: {} } as any;
            const result = AuthService.getAuthUrl(req);

            expect(result.authUrl).toContain('localhost:8081'); // Replaced host
            expect(result.codeVerifier).toBe('verifier');
            expect(mockClient.authorizationUrl).toHaveBeenCalled();
        });

        it('should handle theme and idpHint', () => {
            const req = { session: {} } as any;
            AuthService.getAuthUrl(req, 'google', undefined, 'dark');
            expect(mockClient.authorizationUrl).toHaveBeenCalledWith(expect.objectContaining({
                kc_idp_hint: 'google',
                ui_theme: 'dark'
            }));
        });

        it('should handle kc_action for linked accounts', () => {
            const req = { session: { tokens: {} } } as any;
            AuthService.getAuthUrl(req, 'github');
            expect(mockClient.authorizationUrl).toHaveBeenCalledWith(expect.objectContaining({
                kc_action: 'idp_link:github'
            }));
        });

        it('should handle various actions', () => {
            const req = { session: {} } as any;
            
            AuthService.getAuthUrl(req, undefined, 'register');
            expect(mockClient.authorizationUrl).toHaveBeenLastCalledWith(expect.objectContaining({ kc_action: 'REGISTRATION' }));

            AuthService.getAuthUrl(req, undefined, 'UPDATE_PASSWORD');
            expect(mockClient.authorizationUrl).toHaveBeenLastCalledWith(expect.objectContaining({ kc_action: 'UPDATE_PASSWORD' }));

            AuthService.getAuthUrl(req, undefined, 'UPDATE_PROFILE');
            expect(mockClient.authorizationUrl).toHaveBeenLastCalledWith(expect.objectContaining({ kc_action: 'UPDATE_PROFILE' }));
        });
    });

    describe('handleCallback', () => {
        it('should handle the callback and return tokenSet and userInfo', async () => {
            const req = {} as any;
            const result = await AuthService.handleCallback(req, 'verifier');

            expect(mockClient.callbackParams).toHaveBeenCalledWith(req);
            expect(mockClient.callback).toHaveBeenCalled();
            expect(result.userInfo.sub).toBe('user123');
        });
    });

    describe('refreshToken', () => {
        it('should refresh the token', async () => {
            const result = await AuthService.refreshToken('old-rt');
            expect(mockClient.refresh).toHaveBeenCalledWith('old-rt');
            expect(result.access_token).toBe('new-at');
        });
    });

    describe('getUserInfo', () => {
        it('should get user info', async () => {
            const result = await AuthService.getUserInfo('at');
            expect(mockClient.userinfo).toHaveBeenCalledWith('at');
            expect(result.sub).toBe('user123');
        });
    });

    describe('getLogoutUrl', () => {
        it('should generate a logout URL', () => {
            const logoutUrl = AuthService.getLogoutUrl('id-token', 'http://redirect');
            expect(logoutUrl).toContain('localhost:8081');
            expect(mockClient.endSessionUrl).toHaveBeenCalled();
        });
    });

    describe('localLogin', () => {
        it('should login locally and return tokenSet and userInfo', async () => {
             const { ENV } = require('../config/env.config');
             ENV.KEYCLOAK.CLIENT_SECRET = 'some-secret';
             (axios.post as jest.Mock).mockResolvedValue({ data: { access_token: 'at' } });
            
             const result = await AuthService.localLogin('user', 'pass');
             expect(axios.post).toHaveBeenCalled();
             expect(result.userInfo.sub).toBe('user123');
        });

        it('should throw error on failed login', async () => {
            (axios.post as jest.Mock).mockRejectedValue(new Error('Failed'));
            await expect(AuthService.localLogin('user', 'pass')).rejects.toThrow('Invalid username or password');
        });
    });

    describe('localRegister', () => {
        it('should register a user locally', async () => {
            (axios.post as jest.Mock)
                .mockResolvedValueOnce({ data: { access_token: 'admin-at' } }) // Token call
                .mockResolvedValueOnce({}); // Create user call

            const result = await AuthService.localRegister({ username: 'u', password: 'p', email: 'e' });
            expect(result).toBe(true);
            expect(axios.post).toHaveBeenCalledTimes(2);
        });

        it('should login locally without client secret', async () => {
            const { ENV } = require('../config/env.config');
            ENV.KEYCLOAK.CLIENT_SECRET = '';
            (axios.post as jest.Mock).mockResolvedValue({ data: { access_token: 'at' } });
            await AuthService.localLogin('u', 'p');
            expect(axios.post).toHaveBeenCalled();
        });

        it('should throw during register if admin secret missing', async () => {
            const { ENV } = require('../config/env.config');
            const original = ENV.KEYCLOAK.ADMIN_CLIENT_SECRET;
            delete ENV.KEYCLOAK.ADMIN_CLIENT_SECRET;
            await expect(AuthService.localRegister({}))
                .rejects.toThrow('Admin Client Secret not configured on backend.');
            ENV.KEYCLOAK.ADMIN_CLIENT_SECRET = original;
        });

        it('should throw during register if createUser call fails', async () => {
            (axios.post as jest.Mock)
                .mockResolvedValueOnce({ data: { access_token: 'admin-at' } })
                .mockRejectedValueOnce(new Error('User Creation Failed'));
            
            await expect(AuthService.localRegister({ username: 'u' }))
                .rejects.toThrow('User Creation Failed');
        });
    });

    describe('syncUserJIT', () => {
        it('should sync user info to local database', async () => {
            const userInfo = { sub: 'u1', preferred_username: 'user1', email: 'e1', name: 'First Last' } as any;
            await AuthService.syncUserJIT(userInfo);
            expect(UserService.syncUser).toHaveBeenCalledWith(expect.objectContaining({
                keycloak_id: 'u1',
                username: 'user1'
            }));
        });

        it('should not throw if sync fails', async () => {
            (UserService.syncUser as jest.Mock).mockRejectedValue(new Error('DB Fail'));
            await expect(AuthService.syncUserJIT({ sub: 'u1' } as any)).resolves.not.toThrow();
        });
    });
});
