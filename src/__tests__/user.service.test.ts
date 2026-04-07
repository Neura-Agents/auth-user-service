import { UserService } from '../services/user.service';
import { pool } from '../config/db.config';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

jest.mock('../config/db.config');
jest.mock('axios');
jest.mock('jsonwebtoken');
jest.mock('jwks-rsa', () => {
    const m = {
        getSigningKey: jest.fn((kid, callback) => {
            callback(null, {
                getPublicKey: () => 'public-key'
            });
        })
    };
    return jest.fn(() => m);
});

describe('UserService', () => {
    let mockPool: any;

    beforeEach(() => {
        jest.clearAllMocks();
        mockPool = {
            query: jest.fn()
        };
        (pool.query as jest.Mock) = mockPool.query;
    });

    describe('syncUser', () => {
        it('should sync user info to DB and call api-key service', async () => {
            mockPool.query.mockResolvedValue({ rows: [] });
            (axios.post as jest.Mock).mockResolvedValue({});

            await UserService.syncUser({ keycloak_id: 'u1', username: 'user1' });

            expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO users'), expect.arrayContaining(['u1', 'user1']));
            expect(axios.post).toHaveBeenCalled();
        });

        it('should log error if api-key service fail', async () => {
            mockPool.query.mockResolvedValue({ rows: [] });
            (axios.post as jest.Mock).mockRejectedValue(new Error('Fail'));

            // Spying on console might be needed for full coverage if logs are part of functionality
            await expect(UserService.syncUser({ keycloak_id: 'u2' })).resolves.not.toThrow();
        });
    });

    describe('getSessions/getLinkedAccounts/getCredentials/unlinkAccount', () => {
        const accessToken = 'fake-at';
        it('should get sessions from keycloak', async () => {
            (axios.get as jest.Mock).mockResolvedValue({ data: [{ device: 'Mac' }] });
            const result = await UserService.getSessions(accessToken);
            expect(result[0].device).toBe('Mac');
        });

        it('should get linked accounts from keycloak', async () => {
            (axios.get as jest.Mock).mockResolvedValue({ data: [{ providerName: 'github' }] });
            const result = await UserService.getLinkedAccounts(accessToken);
            expect(result[0].providerName).toBe('github');
        });

        it('should get credentials info from keycloak', async () => {
            (axios.get as jest.Mock).mockResolvedValue({ data: [{ type: 'password' }] });
            const result = await UserService.getCredentials(accessToken);
            expect(result[0].type).toBe('password');
        });

        it('should unlink account in keycloak', async () => {
            (axios.delete as jest.Mock).mockResolvedValue({});
            await UserService.unlinkAccount(accessToken, 'github');
            expect(axios.delete).toHaveBeenCalled();
        });
    });

    describe('verifyToken', () => {
        it('should verify token with RS256', async () => {
            const decodedPayload = { sub: 'u1' };
            (jwt.verify as jest.Mock).mockImplementation((token, key, opts, cb) => {
                key({ kid: '123' }, (err: any, signingKey: any) => {
                    if (err) return cb(err);
                    cb(null, decodedPayload);
                });
            });

            const result = await UserService.verifyToken('t1');
            expect(result.sub).toBe('u1');
        });

        it('should reject if verification fails', async () => {
             (jwt.verify as jest.Mock).mockImplementation((token, key, opts, cb) => {
                cb(new Error('Invalid'), null);
             });

            await expect(UserService.verifyToken('t1')).rejects.toThrow('Invalid token');
        });

        it('should reject if getKey fails', async () => {
            const mockClient = (jwksClient as any)();
            mockClient.getSigningKey.mockImplementationOnce((kid: any, cb: any) => cb(new Error('JWKS Fail')));
            
            (jwt.verify as jest.Mock).mockImplementation((token, key, opts, cb) => {
                key({ kid: '123' }, (err: any, signingKey: any) => {
                    if (err) return cb(err);
                    cb(null, {});
                });
            });

            await expect(UserService.verifyToken('t1')).rejects.toThrow('JWKS Fail');
        });
    });

    describe('decodeTokenPayload', () => {
        it('should decode base64 token payload', () => {
            // Using a simple object and btoa/atob or similar
            const payload = { test: 123 };
            const token = 'header.' + Buffer.from(JSON.stringify(payload)).toString('base64').replace(/=/g, '') + '.sig';
            
            const result = UserService.decodeTokenPayload(token);
            expect(result.test).toBe(123);
        });

        it('should throw if token structure is invalid', () => {
             expect(() => UserService.decodeTokenPayload('bad-token')).toThrow('Invalid token structure');
        });
    });

    describe('getLocalUsers', () => {
        it('should fetch local users with filters', async () => {
            mockPool.query
                .mockResolvedValueOnce({ rows: [{ id: 1, username: 'u1' }] }) // User query
                .mockResolvedValueOnce({ rows: [{ count: '1' }] }); // Count query

            const result = await UserService.getLocalUsers({ search: 'john', limit: 10, offset: 0 });

            expect(result.users[0].username).toBe('u1');
            expect(result.total).toBe(1);
            expect(mockPool.query).toHaveBeenCalledTimes(2);
        });

        it('should work with limit and offset', async () => {
             mockPool.query
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [{ count: '0' }] });

            await UserService.getLocalUsers({ limit: 5, offset: 10 });
            expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('LIMIT'), expect.arrayContaining([5]));
            expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('OFFSET'), expect.arrayContaining([10]));
        });

        it('should work with search query', async () => {
             mockPool.query
                .mockResolvedValueOnce({ rows: [{ keycloak_id: '1' }] })
                .mockResolvedValueOnce({ rows: [{ count: '1' }] });

            const result = await UserService.getLocalUsers({ search: 'test' });
            expect(result.total).toBe(1);
            expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('ILIKE'), expect.arrayContaining(['%test%']));
        });
    });
});
