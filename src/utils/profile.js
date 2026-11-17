export const safeExternalUrl = value => {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const parsed = new URL(value.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    if (!parsed.hostname || parsed.username || parsed.password) return "";
    return parsed.href;
  } catch {
    return "";
  }
};

export const getProfileInitials = value => {
  if (typeof value !== "string") return "T";
  const initials = value.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  return initials || "T";
};
