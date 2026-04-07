import { UserController } from '../controllers/user.controller';
import { UserService } from '../services/user.service';

jest.mock('../services/user.service');

describe('UserController', () => {
    let req: any;
    let res: any;

    beforeEach(() => {
        jest.clearAllMocks();
        req = {
            headers: { authorization: 'Bearer token123' },
            params: {},
            query: {},
            body: {}
        };
        res = {
            status: jest.fn().mockReturnThis(),
            send: jest.fn(),
            json: jest.fn()
        };
    });

    describe('getSessions', () => {
        it('should return user sessions', async () => {
             const mockSessions = [{ id: 's1' }];
             (UserService.getSessions as jest.Mock).mockResolvedValue(mockSessions);
             await UserController.getSessions(req, res);
             expect(res.json).toHaveBeenCalledWith(mockSessions);
        });

        it('should handle service errors', async () => {
             (UserService.getSessions as jest.Mock).mockRejectedValue(new Error('fail'));
             await UserController.getSessions(req, res);
             expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    describe('getLinkedAccounts', () => {
        it('should return linked accounts', async () => {
             const mockAccounts = [{ provider: 'github' }];
             (UserService.getLinkedAccounts as jest.Mock).mockResolvedValue(mockAccounts);
             await UserController.getLinkedAccounts(req, res);
             expect(res.json).toHaveBeenCalledWith(mockAccounts);
        });
    });

    describe('getCredentials', () => {
        it('should return credentials info', async () => {
            const mockCreds = [{ type: 'password' }];
            (UserService.getCredentials as jest.Mock).mockResolvedValue(mockCreds);
            await UserController.getCredentials(req, res);
            expect(res.json).toHaveBeenCalledWith(mockCreds);
        });
    });

    describe('unlinkAccount', () => {
        it('should unlink an account', async () => {
             req.params = { providerName: 'github' };
             (UserService.unlinkAccount as jest.Mock).mockResolvedValue({});
             await UserController.unlinkAccount(req, res);
             expect(res.status).toHaveBeenCalledWith(204);
        });

        it('should handle unlink error', async () => {
            req.params = { providerName: 'github' };
            (UserService.unlinkAccount as jest.Mock).mockRejectedValue(new Error('fail'));
            await UserController.unlinkAccount(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });
    });

    describe('getSecureData', () => {
        it('should return secure data from token payload', () => {
             const mockPayload = { sub: 'u1', preferred_username: 'user1' };
             (UserService.decodeTokenPayload as jest.Mock).mockReturnValue(mockPayload);
             UserController.getSecureData(req, res);
             expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ user: expect.objectContaining({ id: 'u1' }) }));
        });

        it('should handle decode error', () => {
             (UserService.decodeTokenPayload as jest.Mock).mockImplementation(() => { throw new Error('fail'); });
             UserController.getSecureData(req, res);
             expect(res.status).toHaveBeenCalledWith(400);
        });
    });

    describe('syncUser', () => {
        it('should sync user with provided details', async () => {
             req.body = { userId: 'u1', username: 'user1' };
             await UserController.syncUser(req, res);
             expect(UserService.syncUser).toHaveBeenCalledWith(expect.objectContaining({ keycloak_id: 'u1' }));
             expect(res.status).toHaveBeenCalledWith(200);
        });

        it('should ignore sync if no userId provider', async () => {
             req.body = {};
             await UserController.syncUser(req, res);
             expect(res.status).toHaveBeenCalledWith(200);
             expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'ignored' }));
        });

        it('should handle sync error', async () => {
             req.body = { userId: 'u1' };
             (UserService.syncUser as jest.Mock).mockRejectedValue(new Error('fail'));
             await UserController.syncUser(req, res);
             expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    describe('getUsers', () => {
        it('should fetch local users', async () => {
             (UserService.getLocalUsers as jest.Mock).mockResolvedValue({ users: [] });
             await UserController.getUsers(req, res);
             expect(res.json).toHaveBeenCalledWith({ users: [] });
        });

        it('should handle fetch error', async () => {
             (UserService.getLocalUsers as jest.Mock).mockRejectedValue(new Error('fail'));
             await UserController.getUsers(req, res);
             expect(res.status).toHaveBeenCalledWith(500);
        });
    });
});
