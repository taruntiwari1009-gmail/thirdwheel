import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import React, { useContext, useEffect, useState } from "react";
import { AuthContext } from "../context/AuthContext";
import { ChatContext } from "../context/ChatContext";
import { db } from "../firebase";

const Chats = () => {
  const [chats, setChats] = useState([]);
  const { currentUser } = useContext(AuthContext);
  const { dispatch } = useContext(ChatContext);

  useEffect(() => {
    if (!currentUser?.uid) {
      setChats([]);
      return undefined;
    }

    const chatsQuery = query(
      collection(db, "users", currentUser.uid, "userChats"),
      orderBy("date", "desc")
    );
    const unsubscribe = onSnapshot(
      chatsQuery,
      (snapshot) => setChats(snapshot.docs.map((chatDoc) => ({
        chatId: chatDoc.id,
        ...chatDoc.data(),
      }))),
      (error) => {
        console.error("Unable to load conversations:", error);
        setChats([]);
      }
    );

    return unsubscribe;
  }, [currentUser?.uid]);

  const handleSelect = (user) => {
    dispatch({ type: "CHANGE_USER", payload: user });
  };

  return (
    <div className="chats">
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
            <p>{chat.lastMessage?.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default Chats;
