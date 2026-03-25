import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { UserController } from '../controllers/user.controller';

const router = Router();

router.get('/login', AuthController.getLogin);
router.get('/callback', AuthController.getCallback);
router.get('/user', AuthController.getUser);
router.get('/refresh', AuthController.getRefresh);
router.get('/logout', AuthController.getLogout);

// Internal sync route (no Bearer auth required)
router.post('/sync', UserController.syncUser);

// Local authentication
router.post('/local/login', AuthController.postLocalLogin);
router.post('/local/register', AuthController.postLocalRegister);

export default router;
