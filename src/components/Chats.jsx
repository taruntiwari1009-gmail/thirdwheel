import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import React, { useContext, useEffect, useState } from "react";
import { AuthContext } from "../context/AuthContext";
import { ChatContext } from "../context/ChatContext";
import { db } from "../firebase";

const Chats = () => {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { currentUser } = useContext(AuthContext);
  const { dispatch } = useContext(ChatContext);

  useEffect(() => {
    if (!currentUser?.uid) {
      setChats([]);
      setLoading(false);
      setError("");
      return undefined;
    }

    setChats([]);
    setLoading(true);
    setError("");
    const chatsQuery = query(
      collection(db, "users", currentUser.uid, "userChats"),
      orderBy("date", "desc")
    );
    const unsubscribe = onSnapshot(
      chatsQuery,
      (snapshot) => {
        setChats(snapshot.docs.map((chatDoc) => ({
          chatId: chatDoc.id,
          ...chatDoc.data(),
        })));
        setLoading(false);
        setError("");
      },
      (listenerError) => {
        console.error("Unable to load conversations:", listenerError);
        setLoading(false);
        setError("Your conversations could not be loaded. Please refresh.");
      }
    );

    return unsubscribe;
  }, [currentUser?.uid]);

  const handleSelect = (user) => {
    if (user?.uid) dispatch({ type: "CHANGE_USER", payload: user });
  };

  return (
    <div className="chats">
      {loading && <p role="status">Loading conversations...</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && chats.length === 0 && (
        <p>No conversations yet. Search for someone to start chatting.</p>
      )}
      {chats.map((chat) => (
        <div
          className="userChat"
          key={chat.chatId}
          onClick={() => handleSelect(chat.userInfo)}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              handleSelect(chat.userInfo);
            }
          }}
        >
          <img src={chat.userInfo?.photoURL} alt="" />
          <div className="userChatInfo">
            <span>{chat.userInfo?.displayName}</span>
            <p>{chat.lastMessage?.text || "Start a conversation"}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default Chats;
