import { safeExternalUrl, getProfileInitials } from "./profile";

describe("safeExternalUrl", () => {
  test.each([
    ["https://example.com", "https://example.com/"],
    ["http://example.com/about", "http://example.com/about"],
    [" https://example.com/profile ", "https://example.com/profile"],
  ])("allows web URLs: %s", (input, expected) => {
    expect(safeExternalUrl(input)).toBe(expected);
  });

  test.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "//example.com/path",
    "https://user:password@example.com",
    "",
    null,
    42,
  ])("rejects unsafe or invalid URL: %s", input => {
    expect(safeExternalUrl(input)).toBe("");
  });
});

describe("getProfileInitials", () => {
  test.each([
    ["Tarun Tiwari", "TT"],
    ["  Palak   Sharma  ", "PS"],
    ["Single", "S"],
    ["", "T"],
    ["   ", "T"],
    [null, "T"],
  ])("formats initials for %s", (input, expected) => {
    expect(getProfileInitials(input)).toBe(expected);
  });
});
