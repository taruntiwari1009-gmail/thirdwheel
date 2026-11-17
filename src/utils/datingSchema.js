export const DATING_SCHEMA_VERSION = 1;

export const RELATIONSHIP_INTENTS = Object.freeze([
  "long_term",
  "life_partner",
  "marriage_minded",
  "short_term",
  "figuring_out",
  "friends_first"
]);

export const PROFILE_PROMPTS = Object.freeze([
  "A perfect weekend for me looks like…",
  "A topic I can talk about for hours…",
  "Something I value in a relationship…",
  "The little things that make me happy…"
]);

export const MATCH_STATES = Object.freeze([
  "pending",
  "matched",
  "unmatched",
  "blocked",
  "reported",
  "suspended",
  "deleted"
]);

export const PROFILE_VISIBILITY = Object.freeze({
  discoverable: "publicProfiles",
  preferences: "privatePreferences",
  moderation: "serverOnly"
});

const cleanString = (value, maxLength) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

export const normalizeDatingProfile = (input = {}) => ({
  schemaVersion: DATING_SCHEMA_VERSION,
  relationshipIntent: RELATIONSHIP_INTENTS.includes(input.relationshipIntent)
    ? input.relationshipIntent
    : "",
  prompts: Array.isArray(input.prompts)
    ? input.prompts.slice(0, 3).map(item => ({
      prompt: PROFILE_PROMPTS.includes(item?.prompt) ? item.prompt : "",
      answer: cleanString(item?.answer, 240)
    })).filter(item => item.prompt && item.answer)
    : [],
  // City/region only. Never store precise coordinates in a public profile.
  city: cleanString(input.city, 80),
  interests: Array.isArray(input.interests)
    ? [...new Set(input.interests.map(value => cleanString(value, 40)).filter(Boolean))].slice(0, 20)
    : []
});

export const validateDatingProfile = profile => {
  const errors = [];
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return ["Profile must be an object."];
  }
  if (profile.relationshipIntent && !RELATIONSHIP_INTENTS.includes(profile.relationshipIntent)) {
    errors.push("Choose a supported relationship intention.");
  }
  if (profile.prompts !== undefined) {
    if (!Array.isArray(profile.prompts) || profile.prompts.length > 3) {
      errors.push("Use no more than three profile prompts.");
    } else {
      const seen = new Set();
      profile.prompts.forEach(item => {
        if (!item || !PROFILE_PROMPTS.includes(item.prompt) || typeof item.answer !== "string" || !item.answer.trim() || item.answer.length > 240) {
          errors.push("Each prompt needs a supported question and an answer of up to 240 characters.");
        }
        if (item?.prompt && seen.has(item.prompt)) errors.push("A profile prompt can only be used once.");
        if (item?.prompt) seen.add(item.prompt);
      });
    }
  }
  if (profile.city !== undefined && (typeof profile.city !== "string" || profile.city.length > 80)) {
    errors.push("City must be a text value of up to 80 characters.");
  }
  if (profile.interests !== undefined && (!Array.isArray(profile.interests) || profile.interests.length > 20 || profile.interests.some(value => typeof value !== "string" || value.length > 40))) {
    errors.push("Use up to 20 interests, each no longer than 40 characters.");
  }
  if (profile.dateOfBirth !== undefined || profile.age !== undefined || profile.exactLocation !== undefined || profile.coordinates !== undefined) {
    errors.push("Age assurance and precise location are not accepted in public dating profiles.");
  }
  return errors;
};
