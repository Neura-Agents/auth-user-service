import axios from 'axios';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { ENV } from '../config/env.config';
import { SessionDevice, LinkedAccount, CredentialsInfo } from '../models/auth';
import { pool } from '../config/db.config';

const client = jwksClient({
    jwksUri: `${ENV.KEYCLOAK.ISSUER_URL}/protocol/openid-connect/certs`,
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5
});

function getKey(header: any, callback: any) {
    client.getSigningKey(header.kid, (err, key: any) => {
        if (err) {
            callback(err);
            return;
        }
        const signingKey = key.getPublicKey();
        callback(null, signingKey);
    });
}

export class UserService {
    /**
     * Upsert user details from Keycloak into the local database
     */
    static async syncUser(userData: {
        keycloak_id: string;
        username?: string;
        email?: string;
        firstName?: string;
        lastName?: string;
    }): Promise<void> {
        const query = `
            INSERT INTO users (keycloak_id, username, email, first_name, last_name, updated_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (keycloak_id) DO UPDATE SET
                username = EXCLUDED.username,
                email = EXCLUDED.email,
                first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name,
                updated_at = NOW();
        `;
        const values = [
            userData.keycloak_id,
            userData.username,
            userData.email,
            userData.firstName,
            userData.lastName
        ];
        await pool.query(query, values);

        // Create default API key for the user (fire and forget or handle error)
        try {
            await axios.post(`${ENV.API_KEY_SERVICE_URL}/backend/api/api-keys/default/${userData.keycloak_id}`, {}, {
                headers: {
                    'Internal-Request': 'true' // Optional: help identify internal bypass
                }
            });
        } catch (err: any) {
            console.error(`Failed to create default API key for user ${userData.keycloak_id}:`, err.message);
        }
    }
    static async getSessions(accessToken: string): Promise<SessionDevice[]> {
        const keycloakUrl = `${ENV.KEYCLOAK.ISSUER_URL}/account/sessions/devices`;
        const publicHost = new URL(ENV.KEYCLOAK.PUBLIC_ISSUER_URL).host;
        
        const response = await axios.get(keycloakUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json',
                'Host': publicHost
            }
        });
        return response.data as SessionDevice[];
    }

    /**
     * Fetch user linked accounts from Keycloak directly
     */
    static async getLinkedAccounts(accessToken: string): Promise<LinkedAccount[]> {
        const keycloakUrl = `${ENV.KEYCLOAK.ISSUER_URL}/account/linked-accounts?first=0&max=10`;
        const publicHost = new URL(ENV.KEYCLOAK.PUBLIC_ISSUER_URL).host;

        const response = await axios.get(keycloakUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json',
                'Host': publicHost
            }
        });
        return response.data as LinkedAccount[];
    }

    /**
     * Fetch user's credentials info
     */
    static async getCredentials(accessToken: string): Promise<CredentialsInfo[]> {
        const keycloakUrl = `${ENV.KEYCLOAK.ISSUER_URL}/account/credentials`;
        const publicHost = new URL(ENV.KEYCLOAK.PUBLIC_ISSUER_URL).host;

        const response = await axios.get(keycloakUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json',
                'Host': publicHost
            }
        });
        return response.data as CredentialsInfo[];
    }

    /**
     * Unlink a provider
     */
    static async unlinkAccount(accessToken: string, providerName: string): Promise<void> {
        const keycloakUrl = `${ENV.KEYCLOAK.ISSUER_URL}/account/linked-accounts/${providerName}`;
        const publicHost = new URL(ENV.KEYCLOAK.PUBLIC_ISSUER_URL).host;

        await axios.delete(keycloakUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json',
                'Host': publicHost
            }
        });
    }

    /**
     * Securely verify and decode JWT payload using Keycloak public keys (RS256)
     */
    static async verifyToken(token: string): Promise<Record<string, any>> {
        return new Promise((resolve, reject) => {
            jwt.verify(token, getKey, {
                issuer: [ENV.KEYCLOAK.ISSUER_URL, ENV.KEYCLOAK.PUBLIC_ISSUER_URL],
                algorithms: ['RS256']
            }, (err, decoded) => {
                if (err) {
                    console.error('JWT Verification failed:', err.message);
                    return reject(new Error(`Invalid token: ${err.message}`));
                }
                resolve(decoded as Record<string, any>);
            });
        });
    }

    /**
     * Decoding JWT payload explicitly (LEGACY - used for backward compat if needed, but not recommended for auth)
     */
    static decodeTokenPayload(token: string): Record<string, unknown> {
        const base64Url = token.split('.')[1];
        if (!base64Url) {
            throw new Error('Invalid token structure');
        }

        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map((c) => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        return JSON.parse(jsonPayload);
    }

    /**
     * Fetch all users from local database with filters
     */
    static async getLocalUsers(filters: { search?: string; limit?: number; offset?: number }) {
        let query = `SELECT * FROM users`;
        const values: any[] = [];
        const conditions: string[] = [];

        if (filters.search) {
            values.push(`%${filters.search}%`);
            conditions.push(`(username ILIKE $${values.length} OR email ILIKE $${values.length} OR first_name ILIKE $${values.length} OR last_name ILIKE $${values.length})`);
        }

        if (conditions.length > 0) {
            query += ` WHERE ` + conditions.join(' AND ');
        }

        query += ` ORDER BY created_at DESC`;

        if (filters.limit) {
            values.push(filters.limit);
            query += ` LIMIT $${values.length}`;
        }

        if (filters.offset) {
            values.push(filters.offset);
            query += ` OFFSET $${values.length}`;
        }

        const result = await pool.query(query, values);
        
        // Also get total count for pagination
        const countQuery = filters.search 
            ? `SELECT COUNT(*) FROM users WHERE (username ILIKE $1 OR email ILIKE $1 OR first_name ILIKE $1 OR last_name ILIKE $1)`
            : `SELECT COUNT(*) FROM users`;
        const countValues = filters.search ? [`%${filters.search}%`] : [];
        const countResult = await pool.query(countQuery, countValues);

        return {
            users: result.rows,
            total: parseInt(countResult.rows[0].count),
            limit: filters.limit || result.rows.length,
            offset: filters.offset || 0
        };
    }
}
