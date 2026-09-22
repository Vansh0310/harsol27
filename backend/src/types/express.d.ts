import type { AdminRole } from '../../generated/prisma/enums';

export interface AuthenticatedAdmin {
  id: string;
  email: string;
  role: AdminRole;
}

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth once the access token cookie has been verified. */
      admin?: AuthenticatedAdmin;
    }
  }
}

export {};
