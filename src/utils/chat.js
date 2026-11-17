export const getChatId = (firstUid, secondUid) => {
  if (
    typeof firstUid !== "string" ||
    typeof secondUid !== "string" ||
    !firstUid ||
    !secondUid ||
    firstUid === secondUid
  ) {
    return null;
  }

  return firstUid < secondUid
    ? firstUid + secondUid
    : secondUid + firstUid;
};

export const hasMessageContent = (text, image) =>
  Boolean((typeof text === "string" && text.trim()) || image);

export const isAllowedImage = (file, maxBytes = 5 * 1024 * 1024) =>
  Boolean(
    file &&
      typeof file.type === "string" &&
      file.type.startsWith("image/") &&
      Number.isFinite(file.size) &&
      file.size > 0 &&
      file.size <= maxBytes
  );
