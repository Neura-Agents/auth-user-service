jest.mock('jwks-rsa', () => {
    return jest.fn().mockImplementation(() => {
        return {
            getSigningKey: jest.fn((kid, callback) => {
                callback(null, {
                    getPublicKey: () => 'public-key'
                });
            })
        };
    });
});

jest.mock('openid-client', () => {
    return {
        generators: {
            codeVerifier: jest.fn(() => 'verifier'),
            codeChallenge: jest.fn(() => 'challenge')
        },
        TokenSet: jest.fn().mockImplementation((data) => ({
            ...data,
            expired: jest.fn().mockReturnValue(false),
            claims: jest.fn().mockReturnValue({ sub: 'user123', preferred_username: 'test' })
        }))
    };
});
