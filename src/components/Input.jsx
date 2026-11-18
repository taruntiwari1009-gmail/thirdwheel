import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import Img from "../img/img.png";
import { AuthContext } from "../context/AuthContext";
import { ChatContext } from "../context/ChatContext";
import { v4 as uuid } from "uuid";
import { hasMessageContent, isAllowedImage } from "../utils/chat";
import { reconcileAndCleanupOutboxMessage, sendMessage } from "../services/backend";
import {
  createFileFromStoredAttachment,
  createOutboxEntry,
  deleteOutboxMessage,
  enqueueMessageAndClearDraft,
  listOutboxMessages,
  loadConversationDraft,
  saveConversationDraft,
  updateOutboxMessage,
} from "../services/messageStore";

const statusLabel = item => {
  if (item.status === "queued") return "Waiting for a connection";
  if (item.status === "sending") return item.stage === "uploading" ? "Uploading attachment…" : "Saving message…";
  if (item.status === "uncertain") return "Delivery not confirmed · safe to retry";
  return item.lastError || "Needs another attempt";
};

const Input = () => {
  const [text, setText] = useState("");
  const [img, setImg] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [pendingItems, setPendingItems] = useState([]);
  const [draftReadyKey, setDraftReadyKey] = useState("");
  const [enqueueing, setEnqueueing] = useState(false);
  const [sendingKey, setSendingKey] = useState("");
  const [sendingStage, setSendingStage] = useState("");
  const [isOnline, setIsOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileInputRef = useRef(null);
  const activeSendRef = useRef(null);
  const enqueueRef = useRef(false);
  const contextRef = useRef(null);
  const sendStoredRef = useRef(null);
  const currentUserContext = useContext(AuthContext);
  const chatContext = useContext(ChatContext);
  const currentUser = currentUserContext.currentUser;
  const data = chatContext.data;
  const userId = currentUser?.uid || "";
  const conversationId = data.chatId || "";
  const conversationKey = userId && conversationId ? userId + ":" + conversationId : "";

  contextRef.current = { userId, conversationId };

  const refreshPending = useCallback(async () => {
    const current = contextRef.current;
    if (!current.userId || !current.conversationId) {
      setPendingItems([]);
      return [];
    }
    const items = await listOutboxMessages(current.userId, current.conversationId);
    const latest = contextRef.current;
    if (latest.userId === current.userId && latest.conversationId === current.conversationId) {
      setPendingItems(items);
    }
    return items;
  }, []);

  useEffect(() => {
    if (!img) { setPreviewUrl(""); return undefined; }
    const url = URL.createObjectURL(img);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [img]);

  // Load this conversation's draft and outbox independently. The key guard prevents
  // a previous conversation's draft from being written into the newly selected chat.
  useEffect(() => {
    let active = true;
    setDraftReadyKey("");
    setText("");
    setImg(null);
    setPendingItems([]);
    setError("");
    if (!conversationKey) return undefined;

    Promise.all([
      loadConversationDraft(userId, conversationId),
      listOutboxMessages(userId, conversationId),
    ]).then(([draft, items]) => {
      if (!active) return;
      setText(draft?.text || "");
      setImg(createFileFromStoredAttachment(draft?.attachment));
      setPendingItems(items);
      setDraftReadyKey(conversationKey);
    }).catch(loadError => {
      console.error("Unable to restore local conversation state:", loadError);
      if (!active) return;
      setError("Your saved draft could not be restored in this browser. Reload this conversation before composing.");
    });

    return () => { active = false; };
  }, [conversationKey, userId, conversationId]);

  // Draft text and selected attachment are stored per user and conversation in IndexedDB.
  useEffect(() => {
    if (!conversationKey || draftReadyKey !== conversationKey) return;
    saveConversationDraft({ userId, conversationId, text, image: img }).catch(saveError => {
      console.error("Unable to save local draft:", saveError);
      setError("This draft could not be saved locally. Keep this tab open until it is sent.");
    });
  }, [conversationKey, draftReadyKey, userId, conversationId, text, img]);

  const sendStoredMessage = useCallback(async entry => {
    if (!entry?.key || activeSendRef.current) return;
    activeSendRef.current = entry.key;
    setSendingKey(entry.key);
    setSendingStage("");
    setError("");

    try {
      await updateOutboxMessage(entry.key, { status: "sending", lastError: "" });
      setPendingItems(previous => previous.map(item =>
        item.key === entry.key ? { ...item, status: "sending", lastError: "" } : item
      ));

      const image = createFileFromStoredAttachment(entry.attachment);
      await sendMessage({
        conversationId: entry.conversationId,
        senderId: entry.senderId,
        text: entry.text,
        image,
        clientMessageId: entry.clientMessageId,
        onProgress: stage => {
          setSendingStage(stage);
          setPendingItems(previous => previous.map(item =>
            item.key === entry.key ? { ...item, status: "sending", stage } : item
          ));
        },
      });

      await deleteOutboxMessage(entry.key);
    } catch (sendError) {
      console.error("Unable to send queued message:", sendError);
      const message = sendError?.message || "Delivery could not be confirmed. Retry safely.";
      await updateOutboxMessage(entry.key, { status: "retry", lastError: message }).catch(storeError => {
        console.error("Unable to persist retry state:", storeError);
      });
      setError("A message is waiting to be retried. Its message ID is saved, so retrying will not create a duplicate.");
    } finally {
      activeSendRef.current = null;
      setSendingKey("");
      setSendingStage("");
      try {
        await refreshPending();
      } catch (refreshError) {
        console.warn("Unable to refresh the local outbox:", refreshError);
      }
    }
  }, [refreshPending]);

  sendStoredRef.current = sendStoredMessage;

  // Flush queued messages across all conversations for this signed-in user.
  // Ambiguous/failed attempts are deliberately not auto-retried; the user chooses Retry.
  useEffect(() => {
    if (!isOnline || !userId || activeSendRef.current) return undefined;
    let active = true;
    listOutboxMessages(userId).then(items => {
      if (!active || activeSendRef.current) return;
      const next = items.find(item => item.status === "queued");
      if (next) sendStoredRef.current?.(next);
    }).catch(queueError => {
      console.warn("Unable to inspect queued messages:", queueError);
    });
    return () => { active = false; };
  }, [pendingItems, isOnline, userId, sendingKey]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      refreshPending().catch(refreshError => console.warn("Outbox refresh after reconnect failed:", refreshError));
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refreshPending]);

  const handleImageSelect = event => {
    const file = event.target.files?.[0];
    if (!file) { setImg(null); return; }
    if (!isAllowedImage(file)) {
      setImg(null);
      event.target.value = "";
      setError("Choose a supported image smaller than 5 MB.");
      return;
    }
    setError("");
    setImg(file);
  };

  const handleSend = async event => {
    event.preventDefault();
    if (enqueueRef.current || !hasMessageContent(text, img)) return;
    if (!userId || !conversationId || !data.user?.uid) {
      setError("Select a conversation before sending a message.");
      return;
    }
    const messageText = text.trim();
    if (messageText.length > 4000) {
      setError("Messages must be 4,000 characters or fewer.");
      return;
    }

    enqueueRef.current = true;
    setEnqueueing(true);
    setError("");
    const entry = createOutboxEntry({
      userId,
      conversationId,
      senderId: userId,
      clientMessageId: uuid(),
      text: messageText,
      image: img,
    });

    try {
      // One IndexedDB transaction records the durable outbox item and clears the
      // draft together. A page close cannot lose the send between those two steps.
      await enqueueMessageAndClearDraft(entry);
      setPendingItems(previous => [...previous, entry].sort((a, b) => a.createdAt - b.createdAt));
      setText("");
      setImg(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (queueError) {
      console.error("Unable to queue message locally:", queueError);
      setError("This message could not be saved for delivery. Your draft has been kept.");
    } finally {
      enqueueRef.current = false;
      setEnqueueing(false);
    }
  };

  const retryMessage = item => {
    if (!isOnline) {
      setError("You’re offline. This message will remain saved until you reconnect.");
      return;
    }
    sendStoredRef.current?.(item);
  };

  const discardQueuedMessage = async item => {
    if (activeSendRef.current === item.key || item.status === "sending") return;
    setError("");
    setNotice("");
    try {
      if (item.status !== "queued") {
        const result = await reconcileAndCleanupOutboxMessage({
          conversationId: item.conversationId,
          senderId: item.senderId,
          clientMessageId: item.clientMessageId,
          attachmentName: item.attachment?.name,
        });
        setNotice(result.delivered
          ? "This message had already been delivered. The local retry copy has been cleared."
          : "The unsent message and any abandoned image upload have been removed.");
      }
      await deleteOutboxMessage(item.key);
      setPendingItems(previous => previous.filter(entry => entry.key !== item.key));
    } catch (discardError) {
      console.error("Unable to remove pending message:", discardError);
      setError("We couldn't safely remove this pending message. Its retry record has been kept.");
    }
  };

  const handleRemoveDraftImage = () => {
    setImg(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const hasPending = pendingItems.length > 0;

  return <form className="input" onSubmit={handleSend}>
    {!isOnline && <div className="messageConnectionNotice" role="status">
      <span className="connectionDot" aria-hidden="true"></span>
      You’re offline. New messages will be saved and sent when you reconnect.
    </div>}
    <input
      type="text"
      placeholder="Write a message…"
      aria-label="Message"
      onChange={event => setText(event.target.value)}
      value={text}
      maxLength={4000}
      disabled={draftReadyKey !== conversationKey || enqueueing}
    />
    <div className="send">
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        id="file"
        ref={fileInputRef}
        className="attachmentInput"
        onChange={handleImageSelect}
        aria-label="Choose an image attachment"
        disabled={enqueueing || draftReadyKey !== conversationKey}
      />
      <label htmlFor="file" className="attachmentButton" title="Attach an image">
        <img src={Img} alt="" /><span>Photo</span>
      </label>
      <button
        type="submit"
        disabled={enqueueing || draftReadyKey !== conversationKey || !hasMessageContent(text, img)}
      >
        {enqueueing ? "Saving…" : isOnline ? "Send" : "Queue"}
      </button>
    </div>
    {img && <div className="attachmentPreview">
      <img src={previewUrl} alt="Selected attachment" />
      <span>{img.name}</span>
      <button type="button" onClick={handleRemoveDraftImage}>Remove</button>
    </div>}
    {hasPending && <section className="messageOutbox" aria-label="Pending messages">
      <div className="messageOutboxHeading">
        <strong>Pending messages</strong>
        <span>{pendingItems.length}</span>
      </div>
      <p className="messageOutboxHint">Your messages are stored on this device until delivery is confirmed.</p>
      {pendingItems.map(item => {
        const isSending = item.key === sendingKey || item.status === "sending";
        const label = isSending
          ? (sendingStage === "uploading" ? "Uploading attachment…" : sendingStage === "saving" ? "Saving message…" : "Sending…")
          : statusLabel(item);
        return <article className="pendingMessageItem" key={item.key}>
          <div className="pendingMessageCopy">
            <strong>{item.text || "Photo attachment"}</strong>
            {item.attachment && <span className="pendingAttachmentName">Photo · {item.attachment.name}</span>}
            <span className={"pendingMessageStatus pendingMessageStatus--" + item.status}>
              <i aria-hidden="true"></i>{label}
            </span>
          </div>
          <div className="pendingMessageActions">
            {(item.status === "retry" || item.status === "uncertain") && <button type="button" onClick={() => retryMessage(item)} disabled={isSending || !isOnline}>Retry</button>}
            {(item.status === "queued" || item.status === "retry" || item.status === "uncertain") && <button type="button" onClick={() => discardQueuedMessage(item)} disabled={isSending}>{item.status === "queued" ? "Discard" : "Remove"}</button>}
          </div>
        </article>;
      })}
      <p className="messageOutboxFootnote">Once an upload has started it cannot be cancelled safely. Retry uses the same message ID to avoid duplicates.</p>
    </section>}
    {notice && <span className="messageOutboxNotice" role="status">{notice}</span>}
    {error && <span role="alert">{error}</span>}
  </form>;
};

export default Input;
