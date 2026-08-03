import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuthProviderRegistry } from "../src/authProviders";
import { rememberSupabaseInvite, takeSupabaseInvite } from "../src/supabaseAuth";

const auth = vi.hoisted(() => ({ start: vi.fn(), requestOtp: vi.fn(), verifyOtp: vi.fn() }));
vi.mock("../src/supabaseAuth", async (original) => {
  const actual = await original<typeof import("../src/supabaseAuth")>();
  return { ...actual, startSupabaseOAuth: auth.start, requestSupabaseOtp: auth.requestOtp, verifySupabaseOtp: auth.verifyOtp };
});

import { SupabaseAuthActions } from "../src/SupabaseAuthActions";

describe("configured authentication providers", () => {
  afterEach(() => { vi.clearAllMocks(); window.sessionStorage.clear(); });

  it("uses explicit configuration and never infers provider availability", () => {
    const base = { VITE_SUPABASE_URL: "https://auth.test", VITE_SUPABASE_ANON_KEY: "anon" };
    const providers = createAuthProviderRegistry({ ...base, VITE_AUTH_GOOGLE_ENABLED: "true",
      VITE_AUTH_APPLE_ENABLED: "false", VITE_AUTH_EMAIL_ENABLED: "false" });
    expect(providers.find(({ id }) => id === "google")?.enabled).toBe(true);
    expect(providers.find(({ id }) => id === "apple")?.enabled).toBe(false);
    expect(providers.find(({ id }) => id === "email")?.enabled).toBe(false);
    expect(createAuthProviderRegistry({ ...base, VITE_AUTH_EMAIL_ENABLED: "true" })
      .find(({ id }) => id === "email")?.enabled).toBe(true);
  });

  it("renders enabled Google and Email actions but not disabled Apple", () => {
    render(<SupabaseAuthActions onComplete={() => undefined} />);
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Email" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue with Apple" })).not.toBeInTheDocument();
  });

  it("shows a safe configuration error when no provider is available", () => {
    render(<SupabaseAuthActions onComplete={() => undefined} providers={[]} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Sign-in providers are not configured");
    expect(screen.queryByRole("button", { name: /Continue with/ })).not.toBeInTheDocument();
  });

  it("keeps launch failures local and preserves an invitation for another provider", async () => {
    auth.start.mockRejectedValueOnce(new Error("Google Sign In is not available right now. Please choose another sign-in option."));
    render(<SupabaseAuthActions onComplete={() => undefined} onOAuthStart={() => rememberSupabaseInvite("invite-gillian")} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Google Sign In is not available right now");
    expect(screen.getByRole("button", { name: "Continue with Email" })).toBeEnabled();
    expect(takeSupabaseInvite()).toBe("invite-gillian");
  });

  it("keeps OTP errors inside the shared panel", async () => {
    auth.requestOtp.mockRejectedValueOnce(new Error("Email Sign In is not available yet. Continue with Google."));
    render(<SupabaseAuthActions onComplete={() => undefined} />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "person@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue with Email" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Email Sign In is not available yet"));
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  });
});
