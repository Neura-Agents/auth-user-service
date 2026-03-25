import 'express-session';
import { TokenSet } from 'openid-client';
import { UserInfo } from '../models/auth';

declare module 'express-session' {
    interface SessionData {
        tokens?: TokenSet;
        user?: UserInfo;
        code_verifier?: string;
        redirect_to?: string;
    }
}
