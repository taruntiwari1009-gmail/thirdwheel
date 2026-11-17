import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import Search from "./Search";
import { AuthContext } from "../context/AuthContext";
import { ChatContext } from "../context/ChatContext";
import { getDocs, where, orderBy } from "firebase/firestore";

jest.mock("firebase/firestore", () => ({
  collection: jest.fn(() => "profiles"),
  doc: jest.fn(),
  getDocs: jest.fn(),
  limit: jest.fn(value => ({ limit: value })),
  orderBy: jest.fn(),
  query: jest.fn((...parts) => ({ parts })),
  runTransaction: jest.fn(),
  serverTimestamp: jest.fn(),
  startAfter: jest.fn(value => ({ after: value })),
  where: jest.fn((...args) => ({ where: args })),
}));

jest.mock("../firebase", () => ({ db: {} }));

const profileDoc = profile => ({ data: () => profile });
const renderSearch = () => render(
  <AuthContext.Provider value={{ currentUser: { uid: "current-user", displayName: "Current User" } }}>
    <ChatContext.Provider value={{ data: {}, dispatch: jest.fn() }}>
      <BrowserRouter><Search /></BrowserRouter>
    </ChatContext.Provider>
  </AuthContext.Provider>
);

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Search", () => {
  test("finds discoverable profiles by normalized display-name prefix without a composite index", async () => {
    getDocs
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [
        profileDoc({ uid: "alice", displayName: "Alice", displayNameLower: "alice", discoverable: true }),
        profileDoc({ uid: "current-user", displayName: "Current User", displayNameLower: "current user", discoverable: true }),
        profileDoc({ uid: "hidden", displayName: "Alina", displayNameLower: "alina", discoverable: false }),
      ] })
      .mockResolvedValueOnce({ docs: [] });

    renderSearch();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "ALI" } });

    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(screen.queryByText("Alina")).not.toBeInTheDocument();
    expect(screen.queryByText("Current User")).not.toBeInTheDocument();
    await waitFor(() => expect(getDocs).toHaveBeenCalledTimes(3));

    const fields = where.mock.calls.map(([field]) => field);
    expect(fields).toEqual(["displayNameLower", "displayNameLower", "username", "username"]);
    expect(fields).not.toContain("discoverable");
    expect(orderBy).not.toHaveBeenCalled();
  });

  test("supports @username prefix searches", async () => {
    getDocs
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [
        profileDoc({ uid: "tarun", displayName: "Tarun Tiwari", displayNameLower: "tarun tiwari", username: "tarun_t", discoverable: true }),
      ] });

    renderSearch();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "@tarun" } });

    expect(await screen.findByText("Tarun Tiwari")).toBeInTheDocument();
    expect(where).toHaveBeenCalledWith("username", ">=", "tarun");
    expect(where).toHaveBeenCalledWith("username", "<=", "tarun\uf8ff");
  });

  test("hides profiles blocked by the signed-in user", async () => {
    getDocs
      .mockResolvedValueOnce({ docs: [{ id: "blocked-user" }] })
      .mockResolvedValueOnce({ docs: [
        profileDoc({ uid: "blocked-user", displayName: "Blocked Person", displayNameLower: "blocked person", discoverable: true }),
        profileDoc({ uid: "visible-user", displayName: "Visible Person", displayNameLower: "visible person", discoverable: true }),
      ] })
      .mockResolvedValueOnce({ docs: [] });
    renderSearch();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "person" } });
    expect(await screen.findByText("Visible Person")).toBeInTheDocument();
    expect(screen.queryByText("Blocked Person")).not.toBeInTheDocument();
  });

  test("shows a recoverable message when Firestore search fails", async () => {
    getDocs
      .mockResolvedValueOnce({ docs: [] })
      .mockRejectedValueOnce(Object.assign(new Error("index unavailable"), { code: "failed-precondition" }))
      .mockResolvedValueOnce({ docs: [] });

    renderSearch();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "alice" } });

    expect(await screen.findByText("Search could not be completed. Please try again.")).toBeInTheDocument();
  });
});
