import { collection, doc, limitToLast, onSnapshot, orderBy, query, runTransaction, serverTimestamp } from "firebase/firestore";
import React, { useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AuthContext } from "../context/AuthContext";
import { ChatContext } from "../context/ChatContext";
import { db } from "../firebase";
import Message from "./Message";

const dayLabel = value => {
  const date = value?.toDate ? value.toDate() : value instanceof Date ? value : null;
  if (!date) return "Earlier";
  const today = new Date(); const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
};

const Messages = () => {
  const [messages, setMessages] = useState([]);
  const [deletedParticipants, setDeletedParticipants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { data } = useContext(ChatContext);
  const { currentUser } = useContext(AuthContext);
  const listRef = useRef(null);
  const shouldStickToBottom = useRef(true);

  useEffect(() => {
    if (!data.chatId) { setMessages([]); setLoading(false); setError(""); return undefined; }
    shouldStickToBottom.current = true;
    setMessages([]); setLoading(true); setError("");
    const chatRef = doc(db, "chats", data.chatId);
    const stopChat = onSnapshot(chatRef, snapshot => {
      setDeletedParticipants(snapshot.exists() ? snapshot.data().deletedParticipants || [] : []);
    }, listenerError => {
      console.error("Unable to load conversation metadata:", listenerError);
      setError("Conversation details could not be loaded. Check your connection and try again.");
      setLoading(false);
    });
    const messagesQuery = query(collection(db, "chats", data.chatId, "messages"), orderBy("date", "asc"), limitToLast(50));
    const stopMessages = onSnapshot(messagesQuery, snapshot => {
      setMessages(snapshot.docs.map(messageDoc => ({ id: messageDoc.id, ...messageDoc.data() })));
      setLoading(false); setError("");
    }, listenerError => {
      console.error("Unable to load messages:", listenerError);
      setLoading(false); setError("Messages could not be loaded. Check your connection and try again.");
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
  }, [data.chatId, currentUser?.uid, messages.length]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (list && shouldStickToBottom.current) list.scrollTop = list.scrollHeight;
  }, [messages]);

  const handleScroll = () => {
    const list = listRef.current;
    if (!list) return;
    shouldStickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
  };

  const grouped = [];
  let previousDay = "";
  messages.forEach(message => {
    const key = dayLabel(message.date);
    if (key !== previousDay) { grouped.push({ type: "day", key: `${key}-${message.id}`, label: key }); previousDay = key; }
    grouped.push({ type: "message", message });
  });

  return <div ref={listRef} className="messages" role="log" aria-label="Conversation messages" aria-live="polite" aria-relevant="additions text" aria-atomic="false" onScroll={handleScroll}>
    {loading && <p role="status">Loading messages…</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && data.chatId && messages.length === 0 && <p className="messageEmpty">No messages yet. Say hello!</p>}
    {grouped.map(item => item.type === "day" ? <div className="dateDivider" key={item.key}><span>{item.label}</span></div> : <Message message={item.message} deleted={deletedParticipants.includes(item.message.senderId)} key={item.message.id} />)}
  </div>;
};
export default Messages;
