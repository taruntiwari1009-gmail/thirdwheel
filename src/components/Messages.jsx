import { collection, doc, documentId, endBefore, getDocs, limitToLast, onSnapshot, orderBy, query, runTransaction, serverTimestamp } from "firebase/firestore";
import React, { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AuthContext } from "../context/AuthContext";
import { ChatContext } from "../context/ChatContext";
import { db } from "../firebase";
import Message from "./Message";

const PAGE_SIZE = 50;

const dayLabel = value => {
  const date = value?.toDate ? value.toDate() : value instanceof Date ? value : null;
  if (!date) return "Earlier";
  const today = new Date(); const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
};

const toMessage = snapshot => ({ id: snapshot.id, ...snapshot.data() });

const Messages = () => {
  const [latestMessages, setLatestMessages] = useState([]);
  const [olderMessages, setOlderMessages] = useState([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState("");
  const [deletedParticipants, setDeletedParticipants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { data } = useContext(ChatContext);
  const { currentUser } = useContext(AuthContext);
  const listRef = useRef(null);
  const shouldStickToBottom = useRef(true);
  const oldestDoc = useRef(null);
  const hasLoadedOlder = useRef(false);
  const pendingScrollRestore = useRef(null);

  const messages = useMemo(() => {
    const byId = new Map();
    [...olderMessages, ...latestMessages].forEach(message => byId.set(message.id, message));
    return Array.from(byId.values()).sort((a, b) => {
      const left = a.date?.toMillis ? a.date.toMillis() : new Date(a.date || 0).getTime();
      const right = b.date?.toMillis ? b.date.toMillis() : new Date(b.date || 0).getTime();
      return left - right || a.id.localeCompare(b.id);
    });
  }, [olderMessages, latestMessages]);

  useEffect(() => {
    if (!data.chatId) {
      setLatestMessages([]); setOlderMessages([]); setHasOlder(false);
      setLoading(false); setLoadingOlder(false); setError(""); setOlderError("");
      oldestDoc.current = null; hasLoadedOlder.current = false;
      return undefined;
    }

    shouldStickToBottom.current = true;
    setLatestMessages([]); setOlderMessages([]); setHasOlder(false);
    setLoading(true); setLoadingOlder(false); setError(""); setOlderError("");
    oldestDoc.current = null; hasLoadedOlder.current = false; pendingScrollRestore.current = null;

    const chatRef = doc(db, "chats", data.chatId);
    const stopChat = onSnapshot(chatRef, snapshot => {
      setDeletedParticipants(snapshot.exists() ? snapshot.data().deletedParticipants || [] : []);
    }, listenerError => {
      console.error("Unable to load conversation metadata:", listenerError);
      setError("Conversation details could not be loaded. Check your connection and try again.");
      setLoading(false);
    });

    const messagesQuery = query(
      collection(db, "chats", data.chatId, "messages"),
      orderBy("date", "asc"),
      orderBy(documentId(), "asc"),
      limitToLast(PAGE_SIZE)
    );
    const stopMessages = onSnapshot(messagesQuery, snapshot => {
      if (!hasLoadedOlder.current) oldestDoc.current = snapshot.docs[0] || null;
      setHasOlder(snapshot.docs.length === PAGE_SIZE);
      setLatestMessages(snapshot.docs.map(toMessage));
      setLoading(false); setError("");
    }, listenerError => {
      console.error("Unable to load messages:", listenerError);
      setLoading(false);
      setError("Messages could not be loaded. Check your connection and try again.");
    });

    return () => { stopChat(); stopMessages(); };
  }, [data.chatId]);

  useEffect(() => {
    if (!data.chatId || !currentUser?.uid) return undefined;
    const entryRef = doc(db, "users", currentUser.uid, "userChats", data.chatId);
    const markRead = async () => {
      try {
        await runTransaction(db, async transaction => {
          const entry = await transaction.get(entryRef);
          if (entry.exists() && Number(entry.data().unreadCount) > 0) {
            transaction.update(entryRef, { unreadCount: 0, lastReadAt: serverTimestamp() });
          }
        });
      } catch (readError) { console.warn("Could not update inbox read state:", readError); }
    };
    markRead();
    return undefined;
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
    const cursor = oldestDoc.current;
    if (!data.chatId || !cursor || loadingOlder || !hasOlder) return;
    const list = listRef.current;
    if (list) pendingScrollRestore.current = { scrollHeight: list.scrollHeight, scrollTop: list.scrollTop };
    shouldStickToBottom.current = false;
    setLoadingOlder(true); setOlderError("");

    try {
      const olderQuery = query(
        collection(db, "chats", data.chatId, "messages"),
        orderBy("date", "asc"),
        orderBy(documentId(), "asc"),
        endBefore(cursor),
        limitToLast(PAGE_SIZE)
      );
      const snapshot = await getDocs(olderQuery);
      const page = snapshot.docs.map(toMessage);
      if (snapshot.docs.length) {
        oldestDoc.current = snapshot.docs[0];
        hasLoadedOlder.current = true;
        setOlderMessages(previous => {
          const byId = new Map(previous.map(message => [message.id, message]));
          page.forEach(message => byId.set(message.id, message));
          return Array.from(byId.values());
        });
      } else {
        oldestDoc.current = null;
      }
      setHasOlder(snapshot.docs.length === PAGE_SIZE);
    } catch (loadError) {
      console.error("Unable to load older messages:", loadError);
      pendingScrollRestore.current = null;
      setOlderError("Older messages couldn't be loaded. Please try again.");
    } finally {
      setLoadingOlder(false);
    }
  };

  const grouped = [];
  let previousDay = "";
  messages.forEach(message => {
    const key = dayLabel(message.date);
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
    {grouped.map(item => item.type === "day" ? <div className="dateDivider" key={item.key}><span>{item.label}</span></div> : <Message message={item.message} deleted={deletedParticipants.includes(item.message.senderId)} key={item.message.id} />)}
  </div>;
};

export default Messages;
