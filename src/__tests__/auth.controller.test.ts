import { AuthController } from '../controllers/auth.controller';
import { AuthService } from '../services/auth.service';
import { TokenSet } from 'openid-client';

jest.mock('../services/auth.service');
jest.mock('openid-client');

describe('AuthController', () => {
    let req: any;
    let res: any;

    beforeEach(() => {
        jest.clearAllMocks();
        req = {
            query: {},
            body: {},
            session: {
                save: jest.fn((cb: any) => cb(null)),
                destroy: jest.fn((cb: any) => cb())
            }
        };
        res = {
            redirect: jest.fn(),
            status: jest.fn().mockReturnThis(),
            send: jest.fn(),
            json: jest.fn()
        };
    });

    describe('getLogin', () => {
        it('should redirect back to auth URL', () => {
             (AuthService.getAuthUrl as jest.Mock).mockReturnValue({ authUrl: 'http://auth', codeVerifier: 'cv' });
             AuthController.getLogin(req, res);
             expect(res.redirect).toHaveBeenCalledWith('http://auth');
             expect(req.session.code_verifier).toBe('cv');
        });

        it('should handle session redirect back to frontend', () => {
             req.query.redirect_to = 'http://front';
             (AuthService.getAuthUrl as jest.Mock).mockReturnValue({ authUrl: 'http://auth', codeVerifier: 'cv' });
             AuthController.getLogin(req, res);
             expect(req.session.redirect_to).toBe('http://front');
        });

        it('should handle errors in login', () => {
             (AuthService.getAuthUrl as jest.Mock).mockImplementation(() => { throw new Error('Fail'); });
             AuthController.getLogin(req, res);
             expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    describe('getCallback', () => {
        it('should handle OIDC callback successfully', async () => {
             req.session.code_verifier = 'cv';
             const tokenSet = { access_token: 'at' };
             const userInfo = { sub: 'u1' };
             (AuthService.handleCallback as jest.Mock).mockResolvedValue({ tokenSet, userInfo });

             await AuthController.getCallback(req, res);

             expect(req.session.tokens).toBe(tokenSet);
             expect(req.session.user).toBe(userInfo);
             expect(AuthService.syncUserJIT).toHaveBeenCalledWith(userInfo);
             expect(res.redirect).toHaveBeenCalled();
        });

        it('should return 400 if codeVerifier is missing', async () => {
             await AuthController.getCallback(req, res);
             expect(res.status).toHaveBeenCalledWith(400);
             expect(res.send).toHaveBeenCalledWith('Missing code_verifier in session');
        });

        it('should handle failure in saving session', async () => {
             req.session.code_verifier = 'cv';
             (AuthService.handleCallback as jest.Mock).mockResolvedValue({ tokenSet: {}, userInfo: {} });
             req.session.save.mockImplementation((cb: any) => cb(new Error('fail')));

             await AuthController.getCallback(req, res);
             expect(res.status).toHaveBeenCalledWith(500);
        });

        it('should handle callback service errors', async () => {
            req.session.code_verifier = 'cv';
            (AuthService.handleCallback as jest.Mock).mockRejectedValue(new Error('fail'));
            await AuthController.getCallback(req, res);
            expect(res.status).toHaveBeenCalledWith(500);
        });

        it('should handle JIT sync failure and proceed', async () => {
            req.session.code_verifier = 'cv';
            (AuthService.handleCallback as jest.Mock).mockResolvedValue({ tokenSet: {}, userInfo: {} });
            (AuthService.syncUserJIT as jest.Mock).mockRejectedValue(new Error('fail'));

            await AuthController.getCallback(req, res);
            expect(res.redirect).toHaveBeenCalled();
        });
    });

    describe('getUser', () => {
        it('should return 401 if user session is missing', async () => {
             await AuthController.getUser(req, res);
             expect(res.status).toHaveBeenCalledWith(401);
        });

        it('should return 401 if token expired and refresh fails', async () => {
             const mockTokenSet = { expired: () => true, refresh_token: 'rt' };
             (TokenSet as unknown as jest.Mock).mockReturnValue(mockTokenSet);
             req.session.user = { name: 'u1' };
             req.session.tokens = mockTokenSet;
             (AuthService.refreshToken as jest.Mock).mockRejectedValue(new Error('Refresh Failed'));

             await AuthController.getUser(req, res);
             expect(res.status).toHaveBeenCalledWith(401);
        });

        it('should refresh token if expired', async () => {
            const mockTokenSet = { expired: () => true, refresh_token: 'rt' };
            (TokenSet as unknown as jest.Mock).mockReturnValue(mockTokenSet);
            req.session.user = { name: 'u1' };
            req.session.tokens = mockTokenSet;
            (AuthService.refreshToken as jest.Mock).mockResolvedValue({ access_token: 'new-at' });

            await AuthController.getUser(req, res);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                token: 'new-at'
            }));
        });

        it('should return user info if token valid', async () => {
            const mockTokenSet = { expired: () => false, access_token: 'at' };
            (TokenSet as unknown as jest.Mock).mockReturnValue(mockTokenSet);
            req.session.user = { name: 'u1' };
            req.session.tokens = mockTokenSet;

            await AuthController.getUser(req, res);
            expect(res.json).toHaveBeenCalled();
        });
    });

    describe('getRefresh', () => {
        it('should return 401 if refresh tokens missing', async () => {
             await AuthController.getRefresh(req, res);
             expect(res.status).toHaveBeenCalledWith(401);
        });

        it('should return refreshed tokens', async () => {
             req.session.tokens = { refresh_token: 'rt' };
             (AuthService.refreshToken as jest.Mock).mockResolvedValue({ access_token: 'new' });
             await AuthController.getRefresh(req, res);
             expect(res.json).toHaveBeenCalled();
        });

        it('should return 401 if refresh fails', async () => {
             req.session.tokens = { refresh_token: 'rt' };
             (AuthService.refreshToken as jest.Mock).mockRejectedValue(new Error('fail'));
             await AuthController.getRefresh(req, res);
             expect(res.status).toHaveBeenCalledWith(401);
        });
    });

    describe('getLogout', () => {
        it('should redirect back if no tokens', () => {
             AuthController.getLogout(req, res);
             expect(res.redirect).toHaveBeenCalled();
        });

        it('should redirect to logout URL', () => {
             req.session.tokens = { id_token: 'id-t' };
             (AuthService.getLogoutUrl as jest.Mock).mockReturnValue('http://logout');
             AuthController.getLogout(req, res);
             expect(res.redirect).toHaveBeenCalledWith('http://logout');
        });
    });

    describe('postLocalLogin', () => {
        it('should handle local login', async () => {
             req.body = { username: 'u', password: 'p' };
             (AuthService.localLogin as jest.Mock).mockResolvedValue({ tokenSet: { access_token: 'at' }, userInfo: { sub: 'u1' } });
             await AuthController.postLocalLogin(req, res);
             expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        });

        it('should return 400 if fields missing', async () => {
            await AuthController.postLocalLogin(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('should return 401 if login fails', async () => {
            req.body = { username: 'u', password: 'p' };
            (AuthService.localLogin as jest.Mock).mockRejectedValue(new Error('bad credentials'));
            await AuthController.postLocalLogin(req, res);
            expect(res.status).toHaveBeenCalledWith(401);
        });
    });

    describe('postLocalRegister', () => {
        it('should handle registration success', async () => {
             req.body = { username: 'u', password: 'p', email: 'e' };
             (AuthService.localRegister as jest.Mock).mockResolvedValue(true);
             await AuthController.postLocalRegister(req, res);
             expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        });

        it('should return 400 if fields missing', async () => {
            await AuthController.postLocalRegister(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('should return 400 if registration fails', async () => {
             req.body = { username: 'u', password: 'p', email: 'e' };
             (AuthService.localRegister as jest.Mock).mockRejectedValue({ response: { data: { errorMessage: 'Already Exists' } } });
             await AuthController.postLocalRegister(req, res);
             expect(res.status).toHaveBeenCalledWith(400);
        });
    });
});
