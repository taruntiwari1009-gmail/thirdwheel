import React from "react";
import { act, render, screen } from "@testing-library/react";
import { onAuthStateChanged } from "firebase/auth";
import { AuthContext, AuthContextProvider } from "./AuthContext";

jest.mock("../firebase", () => ({ auth: {} }));
jest.mock("firebase/auth", () => ({
  onAuthStateChanged: jest.fn(),
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
    unsubscribe.mockClear();
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

  it("publishes the authenticated user after the auth listener fires", () => {
    render(
      <AuthContextProvider>
        <ContextProbe />
      </AuthContextProvider>
    );

    act(() => authListener({ uid: "user-123" }));

    expect(screen.getByText("ready")).toBeInTheDocument();
    expect(screen.getByText("user-123")).toBeInTheDocument();
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
