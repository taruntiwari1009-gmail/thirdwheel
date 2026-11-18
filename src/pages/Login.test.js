import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Login from "./Login";
import { supabase } from "../supabase";

jest.mock("../supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: jest.fn(),
    },
  },
  supabaseProjectHost: "thirdwheel-test.supabase.co",
}));

const renderLogin = () => render(
  <MemoryRouter>
    <Login />
  </MemoryRouter>
);

describe("Login with Supabase Auth", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("submits trimmed email and the supplied password to Supabase", async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({ error: null });
    renderLogin();

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: "  member@example.com  " },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "correct-horse-battery" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => {
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: "member@example.com",
        password: "correct-horse-battery",
      });
    });
  });

  it("shows a safe error when Supabase rejects the credentials", async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({
      error: {
        code: "invalid_credentials",
        status: 400,
        message: "Invalid login credentials",
      },
    });
    jest.spyOn(console, "error").mockImplementation(() => {});
    renderLogin();

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: "member@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "wrong-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to sign in. Check your email and password"
    );
    expect(console.error).toHaveBeenCalledWith(
      "Sign-in failed:",
      expect.objectContaining({
        code: "invalid_credentials",
        supabaseProjectHost: "thirdwheel-test.supabase.co",
      })
    );
  });
});
