import { supabase } from "../supabase";

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
      .ilike("display_name", `${normalized}%`).order("display_name").range(from, to),
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
    return unwrap(await client.from("conversations").select("*")
      .eq("participant_low", participantLow).eq("participant_high", participantHigh).single());
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
      .neq("sender_id", currentUid)
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

export async function sendMessage({ conversationId, senderId, text, image, clientMessageId }) {
  const client = assertSupabase();
  let attachmentPath = null;
  if (image) {
    const cleanName = image.name.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 100) || "attachment";
    attachmentPath = `${conversationId}/${senderId}/${clientMessageId}-${cleanName}`;
    const { error: uploadError } = await client.storage.from("chat-images")
      .upload(attachmentPath, image, { contentType: image.type, upsert: true });
    if (uploadError) throw uploadError;
  }

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
        .eq("client_message_id", clientMessageId).single();
      if (!existing.error) {
        const row = existing.data;
        return { ...row, senderId: row.sender_id, date: row.created_at, text: row.body, img: row.attachment_path };
      }
    }
    if (attachmentPath) {
      await client.storage.from("chat-images").remove([attachmentPath]).catch(() => {});
    }
    throw inserted.error;
  }

  const row = inserted.data;
  return { ...row, senderId: row.sender_id, date: row.created_at, text: row.body, img: row.attachment_path };
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
  const [low, high] = [currentUid, targetUid].sort();
  const conversation = await client.from("conversations").select("id")
    .eq("participant_low", low).eq("participant_high", high).maybeSingle();
  if (conversation.error) throw conversation.error;
  if (conversation.data) {
    const hidden = await client.from("conversation_reads").update({ inbox_hidden: true })
      .eq("conversation_id", conversation.data.id).eq("user_id", currentUid);
    if (hidden.error) throw hidden.error;
  }
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

export async function saveProfile(userId, profile, avatarFile) {
  const client = assertSupabase();
  let photoPath = profile.photoPath || null;
  if (avatarFile) {
    const safeName = avatarFile.name.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 100) || "avatar";
    photoPath = `${userId}/${Date.now()}-${safeName}`;
    const { error } = await client.storage.from("avatars")
      .upload(photoPath, avatarFile, { contentType: avatarFile.type, upsert: false });
    if (error) throw error;
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
  const { error } = await client.from("profiles").update(payload).eq("id", userId);
  if (error) {
    if (avatarFile && photoPath) await client.storage.from("avatars").remove([photoPath]).catch(() => {});
    throw error;
  }
  return getProfile(userId);
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
