import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Register from "./Register";
import { supabase } from "../supabase";
import { saveProfile } from "../services/backend";

jest.mock("../supabase", () => ({
  supabase: {
    auth: {
      signUp: jest.fn(),
    },
  },
  supabaseProjectHost: "thirdwheel-test.supabase.co",
}));

jest.mock("../services/backend", () => ({
  saveProfile: jest.fn(),
}));

const renderRegister = () => render(
  <MemoryRouter>
    <Register />
  </MemoryRouter>
);

const fillRegistrationForm = () => {
  fireEvent.change(screen.getByLabelText(/display name/i), {
    target: { value: "Test Member" },
  });
  fireEvent.change(screen.getByLabelText(/email address/i), {
    target: { value: "new-member@example.com" },
  });
  fireEvent.change(screen.getByLabelText(/^password$/i), {
    target: { value: "correct-horse-battery" },
  });
};

describe("Register with Supabase Auth", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates an authenticated account and saves its starter profile", async () => {
    const user = { id: "00000000-0000-4000-8000-000000000001" };
    supabase.auth.signUp.mockResolvedValue({
      data: { user, session: { user } },
      error: null,
    });
    saveProfile.mockResolvedValue(null);
    renderRegister();
    fillRegistrationForm();

    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Your account and starter profile are ready."
    );
    expect(supabase.auth.signUp).toHaveBeenCalledWith(expect.objectContaining({
      email: "new-member@example.com",
      options: expect.objectContaining({
        emailRedirectTo: window.location.origin,
        data: expect.objectContaining({ display_name: "Test Member" }),
      }),
    }));
    expect(saveProfile).toHaveBeenCalledWith(
      user.id,
      expect.objectContaining({ displayName: "Test Member" }),
      null
    );
  });

  it("relies on the database signup trigger when email confirmation is required", async () => {
    const user = { id: "00000000-0000-4000-8000-000000000002" };
    supabase.auth.signUp.mockResolvedValue({
      data: { user, session: null },
      error: null,
    });
    renderRegister();
    fillRegistrationForm();

    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Check your email to confirm your address"
    );
    expect(saveProfile).not.toHaveBeenCalled();
  });

  it("does not ask the user to register again when profile saving fails after Auth account creation", async () => {
    const user = { id: "00000000-0000-4000-8000-000000000003" };
    supabase.auth.signUp.mockResolvedValue({
      data: { user, session: { user } },
      error: null,
    });
    saveProfile.mockRejectedValue(new Error("profile update denied"));
    jest.spyOn(console, "error").mockImplementation(() => {});
    renderRegister();
    fillRegistrationForm();

    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your account was created, but we couldn't finish updating your profile"
    );
    expect(supabase.auth.signUp).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(
      "Registration failed:",
      expect.objectContaining({
        message: "profile update denied",
        supabaseProjectHost: "thirdwheel-test.supabase.co",
      })
    );
  });
});
