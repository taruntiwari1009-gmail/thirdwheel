const DATABASE_NAME = "thirdwheel-local-messages";
const DATABASE_VERSION = 1;
const DRAFTS_STORE = "drafts";
const OUTBOX_STORE = "outbox";

let databasePromise;

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("This browser does not support local message recovery."));
      return;
    }

    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DRAFTS_STORE)) {
        database.createObjectStore(DRAFTS_STORE, { keyPath: "key" });
      }
      if (!database.objectStoreNames.contains(OUTBOX_STORE)) {
        const store = database.createObjectStore(OUTBOX_STORE, { keyPath: "key" });
        store.createIndex("userId", "userId", { unique: false });
        store.createIndex("conversationId", "conversationId", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error || new Error("Local message storage could not be opened."));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error("Local message storage is busy in another tab. Close the other tab and try again."));
    };
  });
  return databasePromise;
}

function transact(storeName, mode, action) {
  return openDatabase().then(database => new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let result;
    let actionError = null;

    try {
      const request = action(store);
      if (request) {
        request.onsuccess = () => { result = request.result; };
        request.onerror = () => { actionError = request.error; };
      }
    } catch (error) {
      actionError = error;
      transaction.abort();
    }

    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(actionError || transaction.error || new Error("Local message storage failed."));
    transaction.onabort = () => reject(actionError || transaction.error || new Error("Local message storage was interrupted."));
  }));
}

function draftKey(userId, conversationId) {
  return userId + ":" + conversationId;
}

export function saveConversationDraft({ userId, conversationId, text, image }) {
  if (!userId || !conversationId) return Promise.resolve();
  const key = draftKey(userId, conversationId);
  if (!(text || "").trim() && !image) {
    return transact(DRAFTS_STORE, "readwrite", store => store.delete(key));
  }
  const attachment = image ? {
    blob: image,
    name: image.name || "attachment",
    type: image.type || "application/octet-stream",
    size: image.size || 0,
    lastModified: image.lastModified || Date.now(),
  } : null;
  return transact(DRAFTS_STORE, "readwrite", store => store.put({
    key, userId, conversationId,
    text: text || "",
    attachment,
    updatedAt: Date.now(),
  }));
}

export function loadConversationDraft(userId, conversationId) {
  if (!userId || !conversationId) return Promise.resolve(null);
  return transact(DRAFTS_STORE, "readonly", store => store.get(draftKey(userId, conversationId)));
}

export function deleteConversationDraft(userId, conversationId) {
  if (!userId || !conversationId) return Promise.resolve();
  return transact(DRAFTS_STORE, "readwrite", store => store.delete(draftKey(userId, conversationId)));
}

export function createFileFromStoredAttachment(attachment) {
  if (!attachment?.blob) return null;
  const name = attachment.name || "attachment";
  const type = attachment.type || attachment.blob.type || "application/octet-stream";
  const lastModified = attachment.lastModified || Date.now();
  if (typeof File !== "undefined") {
    return new File([attachment.blob], name, { type, lastModified });
  }
  const fallback = attachment.blob.slice(0, attachment.blob.size, type);
  Object.defineProperty(fallback, "name", { value: name });
  Object.defineProperty(fallback, "lastModified", { value: lastModified });
  return fallback;
}

export function createOutboxEntry({ userId, conversationId, senderId, clientMessageId, text, image }) {
  const attachment = image ? {
    blob: image,
    name: image.name || "attachment",
    type: image.type || "application/octet-stream",
    size: image.size || 0,
    lastModified: image.lastModified || Date.now(),
  } : null;
  return {
    key: userId + ":" + conversationId + ":" + clientMessageId,
    userId,
    conversationId,
    senderId,
    clientMessageId,
    text: (text || "").trim(),
    attachment,
    status: "queued",
    lastError: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function enqueueMessage(entry) {
  return transact(OUTBOX_STORE, "readwrite", store => store.put(entry));
}

export async function updateOutboxMessage(key, changes) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(OUTBOX_STORE, "readwrite");
    const store = transaction.objectStore(OUTBOX_STORE);
    const request = store.get(key);
    request.onsuccess = () => {
      if (request.result) {
        store.put({ ...request.result, ...changes, updatedAt: Date.now() });
      }
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Local message status could not be saved."));
    transaction.onabort = () => reject(transaction.error || new Error("Local message status update was interrupted."));
  });
}

export function deleteOutboxMessage(key) {
  return transact(OUTBOX_STORE, "readwrite", store => store.delete(key));
}

export async function listOutboxMessages(userId, conversationId) {
  if (!userId) return [];
  const records = await transact(OUTBOX_STORE, "readonly", store => store.getAll());
  return (records || [])
    .filter(item => item.userId === userId && (!conversationId || item.conversationId === conversationId))
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(item => item.status === "sending" ? { ...item, status: "uncertain" } : item);
}
