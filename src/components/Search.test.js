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
    expect(fields).toEqual(["discoverable", "displayNameLower", "displayNameLower", "discoverable", "username", "username"]);
    expect(fields.filter(field => field === "discoverable")).toHaveLength(2);
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
        profileDoc({ uid: "blocked-user", displayName: "Visible Blocked", displayNameLower: "visible blocked", discoverable: true }),
        profileDoc({ uid: "visible-user", displayName: "Visible Person", displayNameLower: "visible person", discoverable: true }),
      ] })
      .mockResolvedValueOnce({ docs: [] });
    renderSearch();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "visible" } });
    expect(await screen.findByText("Visible Person")).toBeInTheDocument();
    expect(screen.queryByText("Visible Blocked")).not.toBeInTheDocument();
  });

  test("filters blocked people from later pages and merges duplicate profiles by UID", async () => {
    const firstPage = Array.from({ length: 30 }, (_, index) => profileDoc({
      uid: `person-${String(index).padStart(2, "0")}`,
      displayName: `Person ${String(index).padStart(2, "0")}`,
      displayNameLower: `person ${String(index).padStart(2, "0")}`,
      discoverable: true,
    }));
    getDocs
      .mockResolvedValueOnce({ docs: [{ id: "blocked-next-page" }] })
      .mockResolvedValueOnce({ docs: firstPage })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [
        profileDoc({ uid: "blocked-next-page", displayName: "Person blocked", displayNameLower: "person blocked", discoverable: true }),
        profileDoc({ uid: "person-next-page", displayName: "Person next", displayNameLower: "person next", discoverable: true }),
        profileDoc({ uid: "person-00", displayName: "Person 00", displayNameLower: "person 00", discoverable: true }),
      ] });

    renderSearch();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "person" } });
    expect(await screen.findByText("Person 00")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show more people" }));
    fireEvent.click(screen.getByRole("button", { name: "Show more people" }));
    fireEvent.click(screen.getByRole("button", { name: "Show more people" }));

    expect(await screen.findByText("Person next")).toBeInTheDocument();
    expect(screen.queryByText("Person blocked")).not.toBeInTheDocument();
    expect(screen.getAllByText("Person 00")).toHaveLength(1);
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
