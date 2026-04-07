import { requireAuth, requireBearerAuth, requirePlatformAdmin } from '../middlewares/auth.middleware';
import { UserService } from '../services/user.service';

jest.mock('../services/user.service');

describe('Auth Middleware', () => {
    let req: any;
    let res: any;
    let next: any;

    beforeEach(() => {
        jest.clearAllMocks();
        req = {
            session: {},
            headers: {}
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        next = jest.fn();
    });

    describe('requireAuth', () => {
        it('should call next if session tokens exist', () => {
            req.session.tokens = { access_token: 'at' };
            requireAuth(req, res, next);
            expect(next).toHaveBeenCalled();
        });

        it('should return 401 if session tokens missing', () => {
            requireAuth(req, res, next);
            expect(res.status).toHaveBeenCalledWith(401);
        });
    });

    describe('requireBearerAuth', () => {
        it('should call next if Bearer token exists', () => {
            req.headers.authorization = 'Bearer t123';
            requireBearerAuth(req, res, next);
            expect(next).toHaveBeenCalled();
        });

        it('should return 401 if header missing', () => {
            requireBearerAuth(req, res, next);
            expect(res.status).toHaveBeenCalledWith(401);
        });
    });

    describe('requirePlatformAdmin', () => {
        it('should call next if user is platform-admin', async () => {
             req.headers.authorization = 'Bearer t123';
             (UserService.verifyToken as jest.Mock).mockResolvedValue({ realm_access: { roles: ['platform-admin'] } });
             await requirePlatformAdmin(req, res, next);
             expect(next).toHaveBeenCalled();
        });

        it('should return 403 if user is not platform-admin', async () => {
            req.headers.authorization = 'Bearer t123';
            (UserService.verifyToken as jest.Mock).mockResolvedValue({ realm_access: { roles: ['user'] } });
            await requirePlatformAdmin(req, res, next);
            expect(res.status).toHaveBeenCalledWith(403);
        });

        it('should return 401 if token missing', async () => {
            await requirePlatformAdmin(req, res, next);
            expect(res.status).toHaveBeenCalledWith(401);
        });

        it('should return 401 if verification fails', async () => {
            req.headers.authorization = 'Bearer t123';
            (UserService.verifyToken as jest.Mock).mockRejectedValue(new Error('Invalid'));
            await requirePlatformAdmin(req, res, next);
            expect(res.status).toHaveBeenCalledWith(401);
        });
    });
});
