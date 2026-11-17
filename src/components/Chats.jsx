import { doc, onSnapshot } from "firebase/firestore";
import React, { useContext, useEffect, useState } from "react";
import { AuthContext } from "../context/AuthContext";
import { ChatContext } from "../context/ChatContext";
import { db } from "../firebase";

const Chats = () => {
  const [chats, setChats] = useState({});
  const { currentUser } = useContext(AuthContext);
  const { dispatch } = useContext(ChatContext);

  useEffect(() => {
    if (!currentUser?.uid) {
      setChats({});
      return undefined;
    }

    const unsubscribe = onSnapshot(
      doc(db, "userChats", currentUser.uid),
      (snapshot) => setChats(snapshot.data() || {})
    );

    return unsubscribe;
  }, [currentUser?.uid]);

  const handleSelect = (user) => {
    dispatch({ type: "CHANGE_USER", payload: user });
  };

  return (
    <div className="chats">
      {Object.entries(chats)
        .sort((a, b) => {
          const dateA = a[1].date?.toMillis?.() ?? 0;
          const dateB = b[1].date?.toMillis?.() ?? 0;
          return dateB - dateA;
        })
        .map(([chatId, chat]) => (
          <div
            className="userChat"
            key={chatId}
            onClick={() => handleSelect(chat.userInfo)}
          >
            <img src={chat.userInfo?.photoURL} alt="" />
            <div className="userChatInfo">
              <span>{chat.userInfo?.displayName}</span>
              <p>{chat.lastMessage?.text}</p>
            </div>
          </div>
        ))}
    </div>
  );
};

export default Chats;
