declare module "@lovable.dev/cloud-auth-js" {
  export function createLovableAuth(): {
    signInWithOAuth: (
      provider: string,
      opts?: {
        redirect_uri?: string;
        extraParams?: Record<string, string>;
      }
    ) => Promise<{
      redirected?: boolean;
      error?: Error | null;
      tokens?: {
        access_token: string;
        refresh_token: string;
      };
    }>;
  };
}
