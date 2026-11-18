import { supabase, supabaseUrl, supabasePublishableKey } from "../supabase";

const PAGE_SIZE = 50;

function assertSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured. Add the project URL and publishable key to your environment.");
  }
  return supabase;
}

function unwrap(result) {
  if (result.error) throw result.error;
  return result.data;
}

const mapProfile = row => row ? ({
  uid: row.id,
  username: row.username || "",
  displayName: row.display_name || "",
  displayNameLower: row.display_name_lower || "",
  photoPath: row.photo_path || "",
  pronouns: row.pronouns || "",
  bio: row.bio || "",
  interests: row.interests || [],
  hobbies: row.hobbies || [],
  languages: row.languages || [],
  education: row.education || "",
  institution: row.institution || "",
  graduationYear: row.graduation_year || "",
  city: row.city || "",
  connectionGoals: row.connection_goals || [],
  website: row.website || "",
  instagram: row.instagram || "",
  linkedin: row.linkedin || "",
  discoverable: row.discoverable !== false,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
}) : null;

export async function getSignedAssetUrl(bucket, path, expiresIn = 3600) {
  if (!path) return "";
  const client = assertSupabase();
  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data?.signedUrl || "";
}

export async function getProfile(uid) {
  const client = assertSupabase();
  const row = unwrap(await client.from("profiles").select("*").eq("id", uid).maybeSingle());
  if (!row) return null;
  const profile = mapProfile(row);
  profile.photoURL = row.photo_path ? await getSignedAssetUrl("avatars", row.photo_path) : "";
  return profile;
}

export async function searchProfiles(term, currentUid, page = 0) {
  const client = assertSupabase();
  const normalized = String(term || "").trim().toLowerCase().replace(/^@/, "").replace(/[\\%_]/g, "\\$&");
  if (!normalized || !currentUid) return [];
  const from = page * 30;
  const to = from + 29;
  const [names, usernames, blocks] = await Promise.all([
    client.from("profiles").select("*").eq("discoverable", true).neq("id", currentUid)
      .ilike("display_name_lower", `${normalized}%`).order("display_name").range(from, to),
    client.from("profiles").select("*").eq("discoverable", true).neq("id", currentUid)
      .ilike("username", `${normalized}%`).order("username").range(from, to),
    client.from("user_blocks").select("blocker_id,blocked_id")
      .or(`blocker_id.eq.${currentUid},blocked_id.eq.${currentUid}`),
  ]);
  const nameRows = unwrap(names) || [];
  const usernameRows = unwrap(usernames) || [];
  const blockRows = unwrap(blocks) || [];
  const hidden = new Set(blockRows.flatMap(row => [row.blocker_id, row.blocked_id]).filter(id => id !== currentUid));
  const byId = new Map();
  [...nameRows, ...usernameRows].forEach(row => {
    if (row.id !== currentUid && !hidden.has(row.id) && row.discoverable) byId.set(row.id, row);
  });
  return Promise.all([...byId.values()].map(async row => {
    const profile = mapProfile(row);
    profile.photoURL = row.photo_path ? await getSignedAssetUrl("avatars", row.photo_path) : "";
    return profile;
  }));
}

export async function getOrCreateConversation(currentUid, targetUid) {
  const client = assertSupabase();
  if (!currentUid || !targetUid || currentUid === targetUid) throw new Error("Choose another member to start a conversation.");
  const [participantLow, participantHigh] = [currentUid, targetUid].sort();
  const blockCheck = await client.from("user_blocks").select("blocker_id")
    .or(`and(blocker_id.eq.${participantLow},blocked_id.eq.${participantHigh}),and(blocker_id.eq.${participantHigh},blocked_id.eq.${participantLow})`);
  if (blockCheck.error) throw blockCheck.error;
  if (blockCheck.data?.length) throw new Error("This person is unavailable for a new conversation.");

  const existing = await client.from("conversations").select("*")
    .eq("participant_low", participantLow).eq("participant_high", participantHigh).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    const unhide = await client.from("conversation_reads").update({ inbox_hidden: false })
      .eq("conversation_id", existing.data.id).eq("user_id", currentUid);
    if (unhide.error) throw unhide.error;
    return existing.data;
  }

  const inserted = await client.from("conversations")
    .insert({ participant_low: participantLow, participant_high: participantHigh, created_by: currentUid })
    .select("*").single();
  if (!inserted.error) return inserted.data;
  if (inserted.error.code === "23505") {
    const conversation = unwrap(await client.from("conversations").select("*")
      .eq("participant_low", participantLow).eq("participant_high", participantHigh).single());
    const unhide = await client.from("conversation_reads").update({ inbox_hidden: false })
      .eq("conversation_id", conversation.id).eq("user_id", currentUid);
    if (unhide.error) throw unhide.error;
    return conversation;
  }
  throw inserted.error;
}

export async function listInbox(currentUid) {
  const client = assertSupabase();
  const conversations = unwrap(await client.from("conversations").select("*")
    .or(`participant_low.eq.${currentUid},participant_high.eq.${currentUid}`)
    .order("last_message_at", { ascending: false, nullsFirst: false }));
  if (!conversations?.length) return [];
  const ids = conversations.map(item => item.id);
  const peerIds = [...new Set(conversations.map(item =>
    item.participant_low === currentUid ? item.participant_high : item.participant_low
  ))];
  const [reads, profiles] = await Promise.all([
    client.from("conversation_reads").select("*").in("conversation_id", ids),
    client.from("profiles").select("*").in("id", peerIds),
  ]);
  const readRows = unwrap(reads) || [];
  const profileRows = unwrap(profiles) || [];
  const profileById = new Map(profileRows.map(row => [row.id, row]));
  const readByKey = new Map(readRows.map(row => [`${row.conversation_id}:${row.user_id}`, row]));

  return Promise.all(conversations.map(async conversation => {
    const peerId = conversation.participant_low === currentUid
      ? conversation.participant_high : conversation.participant_low;
    const peerRow = profileById.get(peerId);
    const peer = mapProfile(peerRow) || { uid: peerId, displayName: "Deleted account", photoURL: "" };
    peer.photoURL = peerRow?.photo_path ? await getSignedAssetUrl("avatars", peerRow.photo_path).catch(() => "") : "";
    const mine = readByKey.get(`${conversation.id}:${currentUid}`) || {};
    const theirs = readByKey.get(`${conversation.id}:${peerId}`) || {};
    const unreadResult = await client.from("messages").select("id", { count: "exact", head: true })
      .eq("conversation_id", conversation.id)
      .or(`sender_id.is.null,sender_id.neq.${currentUid}`)
      .gt("created_at", mine.last_read_at || "1970-01-01T00:00:00.000Z");
    if (unreadResult.error) throw unreadResult.error;
    return {
      chatId: conversation.id,
      conversation,
      userInfo: { ...peer, peerLastReadAt: theirs.last_read_at || null },
      lastMessage: { text: conversation.last_message_preview || "" },
      date: conversation.last_message_at || conversation.created_at,
      unreadCount: unreadResult.count || 0,
      lastReadAt: mine.last_read_at || null,
      peerLastReadAt: theirs.last_read_at || null,
      hidden: mine.inbox_hidden === true,
    };
  })).then(items => items.filter(item => !item.hidden));
}

export async function loadMessages(conversationId, pageSize = PAGE_SIZE) {
  const client = assertSupabase();
  const rows = unwrap(await client.from("messages").select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1));
  const hasOlder = rows.length > pageSize;
  const page = rows.slice(0, pageSize).reverse();
  return { messages: page.map(row => ({ ...row, senderId: row.sender_id, date: row.created_at, text: row.body, img: row.attachment_path })), hasOlder };
}

export async function loadOlderMessages(conversationId, cursor, pageSize = PAGE_SIZE) {
  const client = assertSupabase();
  const filter = `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`;
  const rows = unwrap(await client.from("messages").select("*")
    .eq("conversation_id", conversationId)
    .or(filter)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1));
  const hasOlder = rows.length > pageSize;
  return {
    messages: rows.slice(0, pageSize).reverse().map(row => ({ ...row, senderId: row.sender_id, date: row.created_at, text: row.body, img: row.attachment_path })),
    hasOlder,
  };
}

export function subscribeToMessages(conversationId, onChange) {
  const client = assertSupabase();
  const channel = client.channel(`messages:${conversationId}`)
    .on("postgres_changes", {
      event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}`,
    }, onChange)
    .subscribe();
  return () => { client.removeChannel(channel); };
}

export function subscribeToInbox(currentUid, onChange) {
  const client = assertSupabase();
  const channel = client.channel(`inbox:${currentUid}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "conversation_reads", filter: `user_id=eq.${currentUid}` }, onChange)
    .subscribe();
  return () => { client.removeChannel(channel); };
}

export async function getPeerLastReadAt(conversationId, peerId) {
  const client = assertSupabase();
  const row = unwrap(await client.from("conversation_reads").select("last_read_at")
    .eq("conversation_id", conversationId).eq("user_id", peerId).maybeSingle());
  return row?.last_read_at || null;
}

export function subscribeToConversationReads(conversationId, onChange) {
  const client = assertSupabase();
  const channel = client.channel(`conversation-reads:${conversationId}`)
    .on("postgres_changes", {
      event: "*", schema: "public", table: "conversation_reads", filter: `conversation_id=eq.${conversationId}`,
    }, onChange)
    .subscribe();
  return () => { client.removeChannel(channel); };
}

export async function markConversationRead(conversationId, userId) {
  const client = assertSupabase();
  const { error } = await client.from("conversation_reads")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId).eq("user_id", userId);
  if (error) throw error;
}

function createUploadAbortError() {
  const error = new Error("Image upload cancelled.");
  error.name = "AbortError";
  return error;
}

function uploadChatImage(path, file, { signal, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const client = assertSupabase();
    let request = null;
    let settled = false;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", handleAbort);
      callback(value);
    };

    const handleAbort = () => {
      if (request) request.abort();
      else finish(reject, createUploadAbortError());
    };

    if (signal?.aborted) {
      finish(reject, createUploadAbortError());
      return;
    }

    signal?.addEventListener("abort", handleAbort, { once: true });

    const start = async () => {
      try {
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        const accessToken = data.session?.access_token;
        if (!accessToken) throw new Error("Your session has expired. Sign in again to upload this image.");
        if (signal?.aborted) {
          finish(reject, createUploadAbortError());
          return;
        }
        if (!supabaseUrl || !supabasePublishableKey) {
          throw new Error("Supabase Storage is not configured.");
        }

        const encodedPath = path.split("/").map(encodeURIComponent).join("/");
        request = new XMLHttpRequest();
        request.open("POST", supabaseUrl.replace(/\/$/, "") + "/storage/v1/object/chat-images/" + encodedPath, true);
        request.timeout = 120000;
        request.setRequestHeader("apikey", supabasePublishableKey);
        request.setRequestHeader("Authorization", "Bearer " + accessToken);
        request.setRequestHeader("Content-Type", file.type);
        request.setRequestHeader("x-upsert", "true");

        onProgress?.({ stage: "uploading", loaded: 0, total: file.size, percentage: 0 });
        request.upload.onprogress = event => {
          if (!event.lengthComputable) {
            onProgress?.({ stage: "uploading", loaded: event.loaded, total: file.size, percentage: null });
            return;
          }
          onProgress?.({
            stage: "uploading",
            loaded: event.loaded,
            total: event.total,
            percentage: Math.min(100, Math.round((event.loaded / event.total) * 100)),
          });
        };
        request.onload = () => {
          if (request.status >= 200 && request.status < 300) {
            finish(resolve, true);
            return;
          }
          let response = {};
          try { response = JSON.parse(request.responseText || "{}"); } catch (_) {}
          const error = new Error(response.message || response.error || "Image upload failed (" + request.status + ").");
          error.code = response.code || response.error || String(request.status);
          error.status = request.status;
          finish(reject, error);
        };
        request.onerror = () => finish(reject, new Error("Network error while uploading the image."));
        request.ontimeout = () => finish(reject, new Error("Image upload timed out. Retry the saved message."));
        request.onabort = () => finish(reject, createUploadAbortError());
        request.send(file);
      } catch (error) {
        finish(reject, error);
      }
    };

    start();
  });
}

export async function sendMessage({ conversationId, senderId, text, image, clientMessageId, signal, onProgress }) {
  const client = assertSupabase();
  let attachmentPath = null;

  if (image) {
    const cleanName = image.name.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 100) || "attachment";
    attachmentPath = conversationId + "/" + senderId + "/" + clientMessageId + "-" + cleanName;
    await uploadChatImage(attachmentPath, image, { signal, onProgress });
  }

  if (signal?.aborted) {
    if (attachmentPath) {
      await client.storage.from("chat-images").remove([attachmentPath]).catch(() => {});
    }
    throw createUploadAbortError();
  }

  onProgress?.({ stage: "saving", loaded: image?.size || 0, total: image?.size || 0, percentage: image ? 100 : null });
  const inserted = await client.from("messages").insert({
    conversation_id: conversationId,
    sender_id: senderId,
    client_message_id: clientMessageId,
    body: (text || "").trim(),
    attachment_path: attachmentPath,
  }).select("*").single();

  if (inserted.error) {
    if (inserted.error.code === "23505") {
      const existing = await client.from("messages").select("*")
        .eq("conversation_id", conversationId).eq("sender_id", senderId)
        .eq("client_message_id", clientMessageId).maybeSingle();
      if (!existing.error && existing.data) {
        const row = existing.data;
        onProgress?.({ stage: "sent", loaded: image?.size || 0, total: image?.size || 0, percentage: 100 });
        return { ...row, senderId: row.sender_id, date: row.created_at, text: row.body, img: row.attachment_path };
      }
      // A duplicate acknowledgement that cannot yet be resolved is ambiguous.
      // Keep the same outbox item and attachment path so a later retry can reconcile it.
      throw inserted.error;
    }

    // Only clean up after a definite database rejection. A timeout/connection
    // failure can happen after the server commits, so deleting the uploaded
    // object in that case could break a message that actually exists.
    const definiteRejectionCodes = new Set(["42501", "23514", "22001", "23503", "P0001"]);
    if (attachmentPath && definiteRejectionCodes.has(inserted.error.code)) {
      await client.storage.from("chat-images").remove([attachmentPath]).catch(() => {});
    }
    throw inserted.error;
  }

  const row = inserted.data;
  onProgress?.({ stage: "sent", loaded: image?.size || 0, total: image?.size || 0, percentage: 100 });
  return { ...row, senderId: row.sender_id, date: row.created_at, text: row.body, img: row.attachment_path };
}

export async function reconcileAndCleanupOutboxMessage({ conversationId, senderId, clientMessageId, attachmentName }) {
  const client = assertSupabase();
  const existing = await client.from("messages").select("id,attachment_path")
    .eq("conversation_id", conversationId)
    .eq("sender_id", senderId)
    .eq("client_message_id", clientMessageId)
    .maybeSingle();
  if (existing.error) throw existing.error;

  if (existing.data) {
    return { delivered: true, message: existing.data };
  }

  if (attachmentName) {
    const cleanName = attachmentName.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 100) || "attachment";
    const path = `${conversationId}/${senderId}/${clientMessageId}-${cleanName}`;
    const { error } = await client.storage.from("chat-images").remove([path]);
    if (error) throw error;
  }

  return { delivered: false };
}

export async function removeConversationFromInbox(conversationId, userId) {
  const client = assertSupabase();
  const { error } = await client.from("conversation_reads")
    .update({ inbox_hidden: true })
    .eq("conversation_id", conversationId).eq("user_id", userId);
  if (error) throw error;
}

export async function isUserBlocked(currentUid, targetUid) {
  const client = assertSupabase();
  const row = unwrap(await client.from("user_blocks").select("blocker_id")
    .eq("blocker_id", currentUid).eq("blocked_id", targetUid).maybeSingle());
  return Boolean(row);
}

export async function setBlocked(currentUid, targetUid, blocked) {
  const client = assertSupabase();
  if (blocked) {
    const { error } = await client.from("user_blocks").delete()
      .eq("blocker_id", currentUid).eq("blocked_id", targetUid);
    if (error) throw error;
    return;
  }
  const { error } = await client.from("user_blocks").insert({ blocker_id: currentUid, blocked_id: targetUid });
  if (error && error.code !== "23505") throw error;
}

export async function listBlockedUsers(currentUid) {
  const client = assertSupabase();
  const blocks = unwrap(await client.from("user_blocks").select("blocked_id")
    .eq("blocker_id", currentUid));
  if (!blocks?.length) return [];
  const profiles = unwrap(await client.from("profiles").select("*").in("id", blocks.map(item => item.blocked_id)));
  return Promise.all((profiles || []).map(async row => {
    const profile = mapProfile(row);
    profile.photoURL = row.photo_path ? await getSignedAssetUrl("avatars", row.photo_path).catch(() => "") : "";
    return profile;
  }));
}

export async function saveProfile(userId, profile, avatarFile, { removeAvatar = false } = {}) {
  const client = assertSupabase();
  const previousPhotoPath = profile.photoPath || null;
  let photoPath = removeAvatar ? null : previousPhotoPath;
  let uploadedPhotoPath = null;

  if (avatarFile) {
    const safeName = avatarFile.name.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 100) || "avatar";
    photoPath = `${userId}/${Date.now()}-${safeName}`;
    const { error } = await client.storage.from("avatars")
      .upload(photoPath, avatarFile, { contentType: avatarFile.type, upsert: false });
    if (error) throw error;
    uploadedPhotoPath = photoPath;
  }

  const payload = {
    username: profile.username ? profile.username.toLowerCase() : null,
    display_name: profile.displayName.trim(),
    photo_path: photoPath,
    pronouns: profile.pronouns || "",
    bio: profile.bio || "",
    interests: profile.interests || [],
    hobbies: profile.hobbies || [],
    languages: profile.languages || [],
    education: profile.education || "",
    institution: profile.institution || "",
    graduation_year: profile.graduationYear || "",
    city: profile.city || "",
    connection_goals: profile.connectionGoals || [],
    website: profile.website || "",
    instagram: profile.instagram || "",
    linkedin: profile.linkedin || "",
    discoverable: profile.discoverable !== false,
  };

  const updated = await client.from("profiles").update(payload).eq("id", userId).select("id").maybeSingle();
  if (updated.error || !updated.data) {
    if (uploadedPhotoPath) await client.storage.from("avatars").remove([uploadedPhotoPath]).catch(() => {});
    if (updated.error) throw updated.error;
    throw new Error("Your profile could not be found. Refresh and try again.");
  }

  // Keep the existing image until the profile update succeeds. A cleanup failure
  // is non-fatal because the profile now points at the replacement or no image.
  if (previousPhotoPath && previousPhotoPath !== photoPath) {
    const { error: cleanupError } = await client.storage.from("avatars").remove([previousPhotoPath]);
    if (cleanupError) console.warn("Previous avatar cleanup failed:", cleanupError);
  }

  // The caller refreshes AuthContext once after the update; avoid a duplicate profile read here.
  return null;
}

export async function reportProfile(reporterId, targetUid, reason, details) {
  const client = assertSupabase();
  return unwrap(await client.from("reports").insert({
    reporter_id: reporterId,
    target_user_id: targetUid,
    reason,
    details: (details || "").trim().slice(0, 500),
  }).select("id,status,created_at").single());
}

export async function getAccountDeletionStatus(userId) {
  const client = assertSupabase();
  const row = unwrap(await client.from("account_deletion_requests").select("status")
    .eq("user_id", userId).maybeSingle());
  return row?.status || "";
}

export async function requestAccountDeletion(userId) {
  const client = assertSupabase();
  const { data, error } = await client.from("account_deletion_requests")
    .insert({ user_id: userId }).select("status").single();
  if (error?.code === "23505") {
    return unwrap(await client.from("account_deletion_requests").select("status").eq("user_id", userId).single());
  }
  if (error) throw error;
  return data;
}

export async function invokeModerationFunction(name, body = {}) {
  const client = assertSupabase();
  const { data, error } = await client.functions.invoke(name, { body });
  if (error) throw error;
  return data;
}

export { mapProfile };
