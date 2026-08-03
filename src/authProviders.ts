export const AUTH_PROVIDER_IDS = ["google", "apple", "email"] as const;
export type AuthProviderId = typeof AUTH_PROVIDER_IDS[number];
export type OAuthProviderId = Exclude<AuthProviderId, "email">;

export type AuthProviderDefinition = {
  id: AuthProviderId;
  label: string;
  buttonLabel: string;
  kind: "oauth" | "otp";
  enabled: boolean;
};

type ProviderEnvironment = {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  VITE_AUTH_GOOGLE_ENABLED?: string;
  VITE_AUTH_APPLE_ENABLED?: string;
  VITE_AUTH_EMAIL_ENABLED?: string;
};

const explicitlyEnabled = (value: string | undefined) => value === "true";

export function createAuthProviderRegistry(environment: ProviderEnvironment): readonly AuthProviderDefinition[] {
  const supabaseConfigured = Boolean(environment.VITE_SUPABASE_URL && environment.VITE_SUPABASE_ANON_KEY);
  return [
    { id: "google", label: "Google", buttonLabel: "Continue with Google", kind: "oauth",
      enabled: supabaseConfigured && explicitlyEnabled(environment.VITE_AUTH_GOOGLE_ENABLED) },
    { id: "apple", label: "Apple", buttonLabel: "Continue with Apple", kind: "oauth",
      enabled: supabaseConfigured && explicitlyEnabled(environment.VITE_AUTH_APPLE_ENABLED) },
    { id: "email", label: "Email", buttonLabel: "Continue with Email", kind: "otp",
      enabled: supabaseConfigured && explicitlyEnabled(environment.VITE_AUTH_EMAIL_ENABLED) }
  ];
}

export const authProviderRegistry = createAuthProviderRegistry({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  VITE_AUTH_GOOGLE_ENABLED: import.meta.env.VITE_AUTH_GOOGLE_ENABLED,
  VITE_AUTH_APPLE_ENABLED: import.meta.env.VITE_AUTH_APPLE_ENABLED,
  VITE_AUTH_EMAIL_ENABLED: import.meta.env.VITE_AUTH_EMAIL_ENABLED
});
export const availableAuthProviders = authProviderRegistry.filter(({ enabled }) => enabled);
export const authProvider = (id: AuthProviderId) => authProviderRegistry.find((provider) => provider.id === id)!;
export const hasAvailableAuthProvider = availableAuthProviders.length > 0;

export class AuthProviderUnavailableError extends Error {
  constructor(public provider: AuthProviderId) {
    const label = authProvider(provider).label;
    const alternatives = availableAuthProviders.filter(({ id }) => id !== provider).map(({ label: name }) => name);
    super(`${label} Sign In is not available yet.${alternatives.length ? ` Continue with ${alternatives.join(" or ")}.` : " Please try again later."}`);
  }
}

export function requireAvailableAuthProvider(id: AuthProviderId): AuthProviderDefinition {
  const provider = authProvider(id);
  if (!provider.enabled) throw new AuthProviderUnavailableError(id);
  return provider;
}
