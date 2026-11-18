import React from "react";
import { act, render, screen } from "@testing-library/react";
import { AuthContext, AuthContextProvider } from "./AuthContext";
import { supabase } from "../supabase";
import { getProfile } from "../services/backend";

jest.mock("../supabase", () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      onAuthStateChange: jest.fn(),
      getSession: jest.fn(),
    },
  },
}));
jest.mock("../services/backend", () => ({ getProfile: jest.fn() }));

const Probe = () => {
  const { currentUser, loading } = React.useContext(AuthContext);
  return <div><span>{loading ? "loading" : "ready"}</span><span>{currentUser?.uid || "signed-out"}</span><span>{currentUser?.displayName || ""}</span></div>;
};

describe("AuthContextProvider with Supabase Auth", () => {
  let listener;
  const unsubscribe = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    supabase.auth.onAuthStateChange.mockImplementation(callback => {
      listener = callback;
      return { data: { subscription: { unsubscribe } } };
    });
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    getProfile.mockResolvedValue(null);
  });

  it("waits for Supabase to resolve the initial session", async () => {
    render(<AuthContextProvider><Probe /></AuthContextProvider>);
    expect(screen.getByText("loading")).toBeInTheDocument();
    await act(async () => {});
    expect(screen.getByText("ready")).toBeInTheDocument();
    expect(screen.getByText("signed-out")).toBeInTheDocument();
  });

  it("publishes the authenticated user and enriches it with the profile", async () => {
    const user = { id: "user-123", email: "test@example.com", user_metadata: { display_name: "Test User" }, app_metadata: {} };
    getProfile.mockResolvedValue({ displayName: "Test User", photoURL: "" });
    render(<AuthContextProvider><Probe /></AuthContextProvider>);
    await act(async () => {
      listener("SIGNED_IN", { user, access_token: "test", refresh_token: "test" });
    });
    expect(getProfile).toHaveBeenCalledWith("user-123");
    expect(screen.getByText("user-123")).toBeInTheDocument();
    expect(screen.getByText("Test User")).toBeInTheDocument();
  });

  it("unsubscribes when the provider unmounts", () => {
    const view = render(<AuthContextProvider><Probe /></AuthContextProvider>);
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
