import React from "react";
import { act, render, screen } from "@testing-library/react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { AuthContext, AuthContextProvider } from "./AuthContext";

jest.mock("../firebase", () => ({ auth: {}, db: {} }));
jest.mock("firebase/auth", () => ({
  onAuthStateChanged: jest.fn(),
}));
jest.mock("firebase/firestore", () => ({
  doc: jest.fn(() => ({})),
  getDoc: jest.fn(),
  updateDoc: jest.fn(),
}));

const ContextProbe = () => {
  const { currentUser, loading } = React.useContext(AuthContext);
  return (
    <div>
      <span>{loading ? "loading" : "ready"}</span>
      <span>{currentUser?.uid || "signed-out"}</span>
    </div>
  );
};

describe("AuthContextProvider", () => {
  let authListener;
  const unsubscribe = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    doc.mockReturnValue("mock-profile-reference");
    getDoc.mockResolvedValue({
      exists: () => false,
    });
    onAuthStateChanged.mockImplementation((_auth, callback) => {
      authListener = callback;
      return unsubscribe;
    });
  });

  it("waits for Firebase to resolve the initial authentication state", () => {
    render(
      <AuthContextProvider>
        <ContextProbe />
      </AuthContextProvider>
    );

    expect(screen.getByText("loading")).toBeInTheDocument();
    expect(screen.getByText("signed-out")).toBeInTheDocument();
  });

  it("publishes the authenticated user after the auth listener fires", async () => {
    render(
      <AuthContextProvider>
        <ContextProbe />
      </AuthContextProvider>
    );

    await act(async () => {
      await authListener({ uid: "user-123", displayName: "Test User" });
    });

    expect(getDoc).toHaveBeenCalledTimes(1);
    expect(screen.getByText("ready")).toBeInTheDocument();
    expect(screen.getByText("user-123")).toBeInTheDocument();
  });

  it("backfills the normalized display name for an existing profile", async () => {
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ displayName: "Test User", displayNameLower: "Test User" }),
    });

    render(
      <AuthContextProvider>
        <ContextProbe />
      </AuthContextProvider>
    );

    await act(async () => {
      await authListener({ uid: "user-123", displayName: "Test User" });
    });

    expect(updateDoc).toHaveBeenCalledTimes(1);
    expect(updateDoc.mock.calls[0][0]).toBe("mock-profile-reference");
    expect(updateDoc.mock.calls[0][1]).toEqual({ displayNameLower: "test user" });
  });

  it("unsubscribes from Firebase when the provider unmounts", () => {
    const view = render(
      <AuthContextProvider>
        <ContextProbe />
      </AuthContextProvider>
    );

    view.unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
