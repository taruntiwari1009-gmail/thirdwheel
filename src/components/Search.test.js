import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import Search from "./Search";
import { AuthContext } from "../context/AuthContext";
import { ChatContext } from "../context/ChatContext";
import { getOrCreateConversation, searchProfiles } from "../services/backend";

jest.mock("../services/backend", () => ({
  getOrCreateConversation: jest.fn(),
  searchProfiles: jest.fn(),
}));

const dispatch = jest.fn();
const renderSearch = () => render(
  <AuthContext.Provider value={{ currentUser: { uid: "current-user", displayName: "Current User" } }}>
    <ChatContext.Provider value={{ data: {}, dispatch }}>
      <BrowserRouter><Search /></BrowserRouter>
    </ChatContext.Provider>
  </AuthContext.Provider>
);

beforeEach(() => {
  jest.clearAllMocks();
  searchProfiles.mockResolvedValue([]);
});

describe("Supabase people search", () => {
  test("normalizes a name query and renders discoverable results from the backend service", async () => {
    searchProfiles.mockResolvedValueOnce([
      { uid: "alice", displayName: "Alice", username: "alice", discoverable: true },
    ]);
    renderSearch();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "ALI" } });
    expect(await screen.findByText("Alice")).toBeInTheDocument();
    await waitFor(() => expect(searchProfiles).toHaveBeenCalledWith("ali", "current-user", 0));
  });

  test("normalizes @username searches", async () => {
    searchProfiles.mockResolvedValueOnce([
      { uid: "tarun", displayName: "Tarun Tiwari", username: "tarun_t", discoverable: true },
    ]);
    renderSearch();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "@Tarun" } });
    expect(await screen.findByText("Tarun Tiwari")).toBeInTheDocument();
    expect(searchProfiles).toHaveBeenCalledWith("tarun", "current-user", 0);
  });

  test("opens a real Supabase conversation and sends its UUID to chat state", async () => {
    searchProfiles.mockResolvedValueOnce([
      { uid: "alice", displayName: "Alice", username: "alice", discoverable: true },
    ]);
    getOrCreateConversation.mockResolvedValue({ id: "conversation-uuid-123" });
    renderSearch();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "alice" } });
    fireEvent.click(await screen.findByRole("button", { name: "Say hello" }));
    await waitFor(() => expect(getOrCreateConversation).toHaveBeenCalledWith("current-user", "alice"));
    expect(dispatch).toHaveBeenCalledWith({
      type: "CHANGE_USER",
      payload: expect.objectContaining({ uid: "alice" }),
      chatId: "conversation-uuid-123",
    });
  });

  test("shows an empty result message", async () => {
    renderSearch();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "nobody" } });
    expect(await screen.findByText("No people found. Try a name or @username.")).toBeInTheDocument();
  });
});
