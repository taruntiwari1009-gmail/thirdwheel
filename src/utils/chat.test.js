import { getChatId, hasMessageContent, isAllowedImage } from "./chat";
import { chatReducer } from "../context/ChatContext";

describe("chat utilities", () => {
  it("creates the same deterministic chat ID regardless of participant order", () => {
    expect(getChatId("user-b", "user-a")).toBe("user-auser-b");
    expect(getChatId("user-a", "user-b")).toBe("user-auser-b");
  });

  it("rejects missing or identical participants", () => {
    expect(getChatId("", "user-b")).toBeNull();
    expect(getChatId("user-a", "user-a")).toBeNull();
  });

  it("recognizes text and image messages but rejects empty messages", () => {
    expect(hasMessageContent(" hello ", null)).toBe(true);
    expect(hasMessageContent("  ", { name: "photo.png" })).toBe(true);
    expect(hasMessageContent("  ", null)).toBe(false);
  });


  it("accepts only non-empty image files within the configured size limit", () => {
    expect(isAllowedImage({ type: "image/png", size: 1024 })).toBe(true);
    expect(isAllowedImage({ type: "text/plain", size: 1024 })).toBe(false);
    expect(isAllowedImage({ type: "image/png", size: 0 })).toBe(false);
    expect(isAllowedImage({ type: "image/png", size: 6 * 1024 * 1024 })).toBe(false);
  });
});

describe("chatReducer", () => {
  const initialState = { chatId: null, user: {} };

  it("selects a valid participant with its server-created conversation ID", () => {
    const next = chatReducer(initialState, {
      type: "CHANGE_USER",
      chatId: "supabase-conversation-uuid",
      payload: { uid: "user-a", displayName: "A" },
    });

    expect(next.chatId).toBe("supabase-conversation-uuid");
    expect(next.user.displayName).toBe("A");
  });

  it("does not change state for invalid or self-chat selections", () => {
    expect(
      chatReducer(initialState, {
        type: "CHANGE_USER",
        chatId: "supabase-conversation-uuid",
        payload: { uid: "user-a" },
      })
    ).toBe(initialState);
  });
});
