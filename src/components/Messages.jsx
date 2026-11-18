import React, { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AuthContext } from "../context/AuthContext";
import { ChatContext } from "../context/ChatContext";
import {
  getPeerLastReadAt, loadMessages, loadOlderMessages, markConversationRead,
  subscribeToConversationReads, subscribeToMessages,
} from "../services/backend";
import Message from "./Message";

const PAGE_SIZE = 50;
const asDate = value => value instanceof Date ? value : value ? new Date(value) : null;
const dayLabel = value => {
  const date = asDate(value);
  if (!date || Number.isNaN(date.getTime())) return "Earlier";
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
};

const Messages = () => {
  const [latestMessages, setLatestMessages] = useState([]);
  const [olderMessages, setOlderMessages] = useState([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState("");
  const [peerLastReadAt, setPeerLastReadAt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { data } = useContext(ChatContext);
  const { currentUser } = useContext(AuthContext);
  const listRef = useRef(null);
  const shouldStickToBottom = useRef(true);
  const activeChatId = useRef(data.chatId);
  const pendingScrollRestore = useRef(null);

  const messages = useMemo(() => {
    const byId = new Map();
    [...olderMessages, ...latestMessages].forEach(message => byId.set(message.id, message));
    return Array.from(byId.values()).sort((a, b) => {
      const left = new Date(a.created_at || a.date || 0).getTime();
      const right = new Date(b.created_at || b.date || 0).getTime();
      return left - right || a.id.localeCompare(b.id);
    });
  }, [olderMessages, latestMessages]);

  const lastOwnMessageId = [...messages].reverse().find(message => message.senderId === currentUser?.uid)?.id || "";

  useEffect(() => {
    if (!data.chatId || !currentUser?.uid) {
      setLatestMessages([]); setOlderMessages([]); setHasOlder(false);
      setLoading(false); setLoadingOlder(false); setError(""); setOlderError(""); setPeerLastReadAt(null);
      activeChatId.current = null;
      return undefined;
    }
    let active = true;
    const chatId = data.chatId;
    activeChatId.current = chatId;
    shouldStickToBottom.current = true;
    pendingScrollRestore.current = null;
    setLatestMessages([]); setOlderMessages([]); setHasOlder(false);
    setLoading(true); setLoadingOlder(false); setError(""); setOlderError("");

    const refresh = async () => {
      try {
        const page = await loadMessages(chatId, PAGE_SIZE);
        if (!active || activeChatId.current !== chatId) return;
        setLatestMessages(page.messages);
        setHasOlder(page.hasOlder);
        setLoading(false); setError("");
      } catch (loadError) {
        console.error("Unable to load messages:", loadError);
        if (active) { setLoading(false); setError("Messages could not be loaded. Check your connection and try again."); }
      }
    };
    const refreshPeerRead = async () => {
      try {
        const value = await getPeerLastReadAt(chatId, data.user?.uid);
        if (active) setPeerLastReadAt(value);
      } catch (readError) {
        console.warn("Unable to load read receipt:", readError);
        if (active) setPeerLastReadAt(null);
      }
    };
    refresh();
    refreshPeerRead();
    const stopMessages = subscribeToMessages(chatId, refresh);
    const stopReads = subscribeToConversationReads(chatId, refreshPeerRead);
    return () => {
      active = false;
      stopMessages();
      stopReads();
      if (activeChatId.current === chatId) activeChatId.current = null;
    };
  }, [data.chatId, data.user?.uid, currentUser?.uid]);

  useEffect(() => {
    if (!data.chatId || !currentUser?.uid) return;
    markConversationRead(data.chatId, currentUser.uid)
      .catch(readError => console.warn("Could not update inbox read state:", readError));
  }, [data.chatId, currentUser?.uid, latestMessages.length]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (pendingScrollRestore.current) {
      const previous = pendingScrollRestore.current;
      list.scrollTop = previous.scrollTop + (list.scrollHeight - previous.scrollHeight);
      pendingScrollRestore.current = null;
    } else if (shouldStickToBottom.current) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages]);

  const handleScroll = () => {
    const list = listRef.current;
    if (!list) return;
    shouldStickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
  };

  const loadOlder = async () => {
    const chatId = data.chatId;
    const cursor = messages[0];
    if (!chatId || !cursor || loadingOlder || !hasOlder) return;
    const list = listRef.current;
    if (list) pendingScrollRestore.current = { scrollHeight: list.scrollHeight, scrollTop: list.scrollTop };
    shouldStickToBottom.current = false;
    setLoadingOlder(true); setOlderError("");
    try {
      const page = await loadOlderMessages(chatId, cursor, PAGE_SIZE);
      if (activeChatId.current !== chatId) return;
      if (page.messages.length) {
        setOlderMessages(previous => {
          const byId = new Map(previous.map(message => [message.id, message]));
          page.messages.forEach(message => byId.set(message.id, message));
          return Array.from(byId.values());
        });
      }
      setHasOlder(page.hasOlder);
    } catch (loadError) {
      if (activeChatId.current !== chatId) return;
      console.error("Unable to load older messages:", loadError);
      pendingScrollRestore.current = null;
      setOlderError("Older messages couldn't be loaded. Please try again.");
    } finally {
      if (activeChatId.current === chatId) setLoadingOlder(false);
    }
  };

  const grouped = [];
  let previousDay = "";
  messages.forEach(message => {
    const key = dayLabel(message.created_at || message.date);
    if (key !== previousDay) {
      grouped.push({ type: "day", key: `${key}-${message.id}`, label: key });
      previousDay = key;
    }
    grouped.push({ type: "message", message });
  });

  return <div ref={listRef} className="messages" role="log" aria-label="Conversation messages" aria-live="polite" aria-relevant="additions text" aria-atomic="false" onScroll={handleScroll}>
    {loading && <p role="status">Loading messages…</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && hasOlder && <div className="olderMessagesControl"><button type="button" className="secondaryAction" onClick={loadOlder} disabled={loadingOlder}>{loadingOlder ? "Loading earlier messages…" : "Load earlier messages"}</button></div>}
    {olderError && <p className="errorText" role="alert">{olderError}</p>}
    {!loading && !error && data.chatId && messages.length === 0 && <p className="messageEmpty">No messages yet. Say hello!</p>}
    {grouped.map(item => {
      if (item.type === "day") return <div className="dateDivider" key={item.key}><span>{item.label}</span></div>;
      const message = item.message;
      const isLatestOwn = message.id === lastOwnMessageId;
      const peerReadMillis = peerLastReadAt ? new Date(peerLastReadAt).getTime() : 0;
      const messageMillis = new Date(message.created_at || message.date).getTime();
      const receipt = isLatestOwn ? (peerReadMillis && messageMillis && peerReadMillis >= messageMillis ? "Seen" : "Sent") : "";
      return <Message message={message} deleted={!message.senderId} receipt={receipt} key={message.id} />;
    })}
  </div>;
};

export default Messages;
