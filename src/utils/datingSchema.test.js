import {
  DATING_SCHEMA_VERSION,
  MATCH_STATES,
  PROFILE_PROMPTS,
  normalizeDatingProfile,
  validateDatingProfile
} from "./datingSchema";

describe("dating schema contract", () => {
  test("normalizes optional dating fields without changing legacy profile requirements", () => {
    expect(normalizeDatingProfile({
      relationshipIntent: "long_term",
      city: " Delhi ",
      interests: ["Reading", "Reading", " ", "Chess"],
      prompts: [{ prompt: PROFILE_PROMPTS[0], answer: "A quiet cafe and a good book." }]
    })).toEqual({
      schemaVersion: DATING_SCHEMA_VERSION,
      relationshipIntent: "long_term",
      city: "Delhi",
      interests: ["Reading", "Chess"],
      prompts: [{ prompt: PROFILE_PROMPTS[0], answer: "A quiet cafe and a good book." }]
    });
  });

  test("rejects unsupported intent and duplicate or oversized prompts", () => {
    expect(validateDatingProfile({
      relationshipIntent: "made_up",
      prompts: [
        { prompt: PROFILE_PROMPTS[0], answer: "One" },
        { prompt: PROFILE_PROMPTS[0], answer: "Two" },
        { prompt: PROFILE_PROMPTS[1], answer: "x".repeat(241) }
      ]
    }).length).toBeGreaterThan(0);
  });

  test("does not allow precise location or age fields in public profile payloads", () => {
    expect(validateDatingProfile({ age: 25, coordinates: { lat: 1, lng: 2 } })).toContain(
      "Age assurance and precise location are not accepted in public dating profiles."
    );
  });

  test("documents explicit match lifecycle states", () => {
    expect(MATCH_STATES).toEqual(["pending", "matched", "unmatched", "blocked", "reported", "suspended", "deleted"]);
  });
});
