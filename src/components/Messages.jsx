import { doc, onSnapshot } from "firebase/firestore";
import React, { useContext, useEffect, useState } from "react";
import { ChatContext } from "../context/ChatContext";
import { db } from "../firebase";
import Message from "./Message";

const Messages = () => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { data } = useContext(ChatContext);

  useEffect(() => {
    if (!data.chatId) {
      setMessages([]);
      setLoading(false);
      setError("");
      return undefined;
    }

    setMessages([]);
    setLoading(true);
    setError("");

    const unsubscribe = onSnapshot(
      doc(db, "chats", data.chatId),
      (snapshot) => {
        setMessages(snapshot.exists() ? snapshot.data().messages || [] : []);
        setLoading(false);
        setError("");
      },
      (listenerError) => {
        console.error("Unable to load messages:", listenerError);
        setLoading(false);
        setError("Messages could not be loaded. Check your connection and try again.");
      }
    );

    return unsubscribe;
  }, [data.chatId]);

  return (
    <div className="messages" aria-live="polite">
      {!data.chatId && <p>Select a conversation to view messages.</p>}
      {loading && <p role="status">Loading messages...</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && data.chatId && messages.length === 0 && (
        <p>No messages yet. Say hello!</p>
      )}
      {messages.map((message) => (
        <Message message={message} key={message.id} />
      ))}
    </div>
  );
};

export default Messages;
