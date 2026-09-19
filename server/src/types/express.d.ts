export type AppRole = "investigator" | "admin";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: AppRole;
}

declare global {
  namespace Express {
    interface Request {
      /** Populated by auth.middleware once a valid bearer token is verified. */
      user?: AuthenticatedUser;
      /** Correlation id attached by the requestId middleware. */
      requestId?: string;
    }
  }
}
