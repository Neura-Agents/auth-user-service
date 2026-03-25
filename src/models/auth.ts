import { TokenSet } from 'openid-client';

export interface UserInfo {
    id?: string;
    sub: string;
    email?: string;
    name?: string;
    preferred_username?: string;
    idp_links?: Array<{
        providerUserId: string;
        providerAlias: string;
    }>;
    idps?: Array<any>;
    [key: string]: unknown;
}

export interface SessionData {
    tokens?: TokenSet;
    user?: UserInfo;
    code_verifier?: string;
}

export interface AuthContext {
    user: UserInfo;
    token: string;
}

export interface SessionDevice {
    id: string;
    ipAddress: string;
    os: string;
    browser: string;
    device: string;
    started: number;
    lastAccess: number;
    clients: Array<{
        clientId: string;
    }>;
}

export interface LinkedAccount {
    providerName: string;
    providerAlias: string;
    providerUserId: string;
    connected: boolean;
}

export interface CredentialsInfo {
    // Defines Keycloak credential details
    id: string;
    type: string;
    userLabel: string;
    createdDate: number;
}
