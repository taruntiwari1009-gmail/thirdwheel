import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import ProtectedRoute from "./ProtectedRoute";

const renderRoute = (authValue) =>
  render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={["/private"]}>
        <Routes>
          <Route
            path="/private"
            element={
              <ProtectedRoute>
                <h1>Private conversation</h1>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<h1>Login screen</h1>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );

describe("ProtectedRoute", () => {
  it("shows a loading state while authentication is unresolved", () => {
    renderRoute({ currentUser: null, loading: true });
    expect(screen.getByRole("status")).toHaveTextContent("Loading...");
  });

  it("redirects signed-out users to login", () => {
    renderRoute({ currentUser: null, loading: false });
    expect(screen.getByRole("heading", { name: "Login screen" })).toBeInTheDocument();
  });

  it("renders protected content for authenticated users", () => {
    renderRoute({ currentUser: { uid: "user-123" }, loading: false });
    expect(screen.getByRole("heading", { name: "Private conversation" })).toBeInTheDocument();
  });
});
