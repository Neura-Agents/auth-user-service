import request from 'supertest';
import { app } from '../index';
import { AuthService } from '../services/auth.service';
import { UserService } from '../services/user.service';

jest.mock('../services/auth.service');
jest.mock('../services/user.service');

jest.mock('../middlewares/auth.middleware', () => ({
    requireBearerAuth: (req: any, res: any, next: any) => next(),
    requirePlatformAdmin: (req: any, res: any, next: any) => next()
}));

describe('Routes', () => {
    describe('Auth Routes', () => {
        it('GET /backend/auth/login should redirect', async () => {
             (AuthService.getAuthUrl as jest.Mock).mockReturnValue({ authUrl: 'http://auth', codeVerifier: 'cv' });
             const res = await request(app).get('/backend/auth/login');
             expect(res.status).toBe(302);
        });

        it('POST /backend/auth/local/login should handle local login', async () => {
             (AuthService.localLogin as jest.Mock).mockResolvedValue({ tokenSet: { access_token: 'at' }, userInfo: { sub: 'u1' } });
             const res = await request(app).post('/backend/auth/local/login').send({ username: 'u', password: 'p' });
             expect(res.status).toBe(200);
        });

        it('POST /backend/auth/local/register should handle local registration', async () => {
             (AuthService.localRegister as jest.Mock).mockResolvedValue(true);
             const res = await request(app).post('/backend/auth/local/register').send({ username: 'u', password: 'p', email: 'e' });
             expect(res.status).toBe(200);
        });
    });

    describe('User Routes', () => {
        it('GET /backend/api/users/sessions should return 200', async () => {
             (UserService.getSessions as jest.Mock).mockResolvedValue([]);
             const res = await request(app).get('/backend/api/users/sessions').set('Authorization', 'Bearer t');
             expect(res.status).toBe(200);
        });

        it('GET /backend/api/users should return 200', async () => {
             (UserService.getLocalUsers as jest.Mock).mockResolvedValue({ users: [], total: 0 });
             const res = await request(app).get('/backend/api/users');
             expect(res.status).toBe(200);
        });
    });
});
