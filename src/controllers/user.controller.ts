import { Request, Response } from 'express';
import { UserService } from '../services/user.service';

export class UserController {
    private static extractToken(req: Request): string {
        const authHeader = req.headers.authorization || '';
        return authHeader.split(' ')[1];
    }

    static async getSessions(req: Request, res: Response): Promise<void> {
        try {
            const token = UserController.extractToken(req);
            const sessions = await UserService.getSessions(token);
            res.json(sessions);
        } catch (error: any) {
            console.error('Error fetching sessions:', error.response?.data || error.message);
            res.status(error.response?.status || 500).json({
                error: error.response?.data || 'Failed to fetch sessions from Keycloak'
            });
        }
    }

    static async getLinkedAccounts(req: Request, res: Response): Promise<void> {
        try {
            const token = UserController.extractToken(req);
            const accounts = await UserService.getLinkedAccounts(token);
            res.json(accounts);
        } catch (error: any) {
            console.error('Error fetching linked accounts:', error.response?.data || error.message);
            res.status(error.response?.status || 500).json({
                error: error.response?.data || 'Failed to fetch linked accounts from Keycloak'
            });
        }
    }

    static async getCredentials(req: Request, res: Response): Promise<void> {
        try {
            const token = UserController.extractToken(req);
            const credentials = await UserService.getCredentials(token);
            res.json(credentials);
        } catch (error: any) {
            console.error('Error fetching credentials:', error.response?.data || error.message);
            res.status(error.response?.status || 500).json({
                error: error.response?.data || 'Failed to fetch credentials from Keycloak'
            });
        }
    }

    static async unlinkAccount(req: Request, res: Response): Promise<void> {
        try {
            const token = UserController.extractToken(req);
            const { providerName } = req.params;
            await UserService.unlinkAccount(token, providerName as string);
            res.status(204).send();
        } catch (error: any) {
            console.error(`Error unlinking provider ${req.params.providerName}:`, error.response?.data || error.message);
            res.status(error.response?.status || 400).json({
                error: error.response?.data?.errorMessage || 'Failed to unlink account'
            });
        }
    }

    static getSecureData(req: Request, res: Response): void {
        try {
            const token = UserController.extractToken(req);
            const payload = UserService.decodeTokenPayload(token);
            res.json({
                message: 'Access granted via Kong Gateway JWT validation!',
                user: {
                    id: payload.sub,
                    username: payload.preferred_username,
                    email: payload.email,
                    name: payload.name
                },
                rawTokenPayload: payload
            });
        } catch (error: any) {
            console.error('Error processing secure data Request:', error);
            res.status(400).json({ error: 'Invalid token structure' });
        }
    }

    static async syncUser(req: Request, res: Response): Promise<void> {
        try {
            console.log('Received sync event:', JSON.stringify(req.body, null, 2));
            
            // Extract data from Keycloak event payload
            // Some plugins send userId, others sub. Details usually contain username/email.
            const userId = req.body.userId || req.body.sub;
            const details = req.body.details || {};
            
            const username = req.body.username || details.username || details.preferred_username;
            const email = req.body.email || details.email;
            const firstName = req.body.firstName || details.first_name || details.firstName;
            const lastName = req.body.lastName || details.last_name || details.lastName;

            if (!userId) {
                console.warn('Sync event received without userId');
                res.status(200).json({ status: 'ignored', reason: 'no userId' });
                return;
            }

            await UserService.syncUser({
                keycloak_id: userId,
                username,
                email,
                firstName,
                lastName
            });

            console.log(`Successfully synced user: ${userId} (${username || email || 'no name'})`);
            res.status(200).json({ status: 'success' });
        } catch (error: any) {
            console.error('Error syncing user:', error.message);
            res.status(500).json({ error: 'Failed to sync user' });
        }
    }

    static async getUsers(req: Request, res: Response): Promise<void> {
        try {
            const { search, limit, offset } = req.query;
            
            const usersData = await UserService.getLocalUsers({
                search: search as string,
                limit: limit ? parseInt(limit as string) : 50,
                offset: offset ? parseInt(offset as string) : 0
            });
            
            res.json(usersData);
        } catch (error: any) {
            console.error('Error fetching local users:', error.message);
            res.status(500).json({ error: 'Failed to fetch users from database' });
        }
    }
}
