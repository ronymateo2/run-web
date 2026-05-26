// Auth provider abstraction — swap this file to change OAuth provider.

export interface SignInResult {
  idToken: string;
  provider: string;
}

export interface AuthProvider {
  signIn(): Promise<SignInResult>;
  signOut(): Promise<void>;
}

// Google provider is implemented in GoogleProvider.tsx (React component)
// because it requires UI. This file just defines the interface.
export const PROVIDER_NAME = "google";
