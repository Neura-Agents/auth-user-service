jest.mock('pg', () => {
    return {
        Pool: jest.fn().mockImplementation(() => ({
            query: jest.fn().mockResolvedValue({})
        }))
    };
});

jest.mock('openid-client', () => {
    const mClient = jest.fn();
    const mIssuer = jest.fn().mockImplementation((metadata) => ({
        metadata,
        Client: mClient
    }));
    (mIssuer as any).discover = jest.fn().mockResolvedValue({
        metadata: { issuer: 'http://keycloak:8080' },
        Client: mClient
    });
    return { Issuer: mIssuer };
});

let initDb: any, pool: any, initKeycloak: any, getKeycloakClient: any;

describe('Config', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        ({ initDb, pool } = require('../config/db.config'));
        ({ initKeycloak, getKeycloakClient } = require('../config/keycloak.config'));
    });

    describe('DB Config', () => {
        it('initDb should correctly initialize database', async () => {
             await initDb();
             expect(pool.query).toHaveBeenCalled();
        });

        it('initDb should handle errors', async () => {
            (pool.query as jest.Mock).mockRejectedValueOnce(new Error('fail'));
            await expect(initDb()).rejects.toThrow('fail');
        });
    });

    describe('Keycloak Config', () => {
        it('getKeycloakClient should throw if not initialized', () => {
            expect(() => getKeycloakClient()).toThrow();
        });

        it('initKeycloak should discover issuer and handle split host', async () => {
             const { ENV } = require('../config/env.config');
             ENV.KEYCLOAK.ISSUER_URL = 'http://internal:8080';
             ENV.KEYCLOAK.PUBLIC_ISSUER_URL = 'http://public:8081';
             
             const client = await initKeycloak(1, 0);
             expect(client).toBeDefined();
        });

        it('initKeycloak should handle reachability retries', async () => {
            const { Issuer } = require('openid-client');
            Issuer.discover.mockRejectedValueOnce(new Error('fail'));
            Issuer.discover.mockResolvedValueOnce({ metadata: { i: 1 }, Client: jest.fn() });
            
            await initKeycloak(2, 0);
            expect(Issuer.discover).toHaveBeenCalledTimes(2);
        });

        it('initKeycloak should throw if all retries fail', async () => {
            const { Issuer } = require('openid-client');
            Issuer.discover.mockRejectedValue(new Error('Persistent Fail'));
            await expect(initKeycloak(2, 0)).rejects.toThrow('Persistent Fail');
        });
    });
});
