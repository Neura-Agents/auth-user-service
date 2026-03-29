import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { requireBearerAuth, requirePlatformAdmin } from '../middlewares/auth.middleware';

const router = Router();

// Apply Bearer Auth Middlewares Since Kong Verifies JWT
router.use(requireBearerAuth);

router.get('/', requirePlatformAdmin, UserController.getUsers);
router.get('/sessions', UserController.getSessions);
router.get('/linked-accounts', UserController.getLinkedAccounts);
router.get('/credentials', UserController.getCredentials);
router.delete('/linked-accounts/:providerName', UserController.unlinkAccount);
router.get('/secure-data', UserController.getSecureData);

export default router;
