import React, { useContext } from "react";
import Messages from "./Messages";
import Input from "./Input";
import { ChatContext } from "../context/ChatContext";
import { Link } from "react-router-dom";

const getInitials = name => (name || "T").trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();

const Chat = () => {
  const { data } = useContext(ChatContext);
  const person = data.user;

  return <div className={`chat ${data.chatId ? "hasConversation" : "emptyConversation"}`}>
    <div className="chatInfo">
      {person?.uid ? (
        <Link to={`/profile/${person.uid}`} className="chatPerson">
          {person.photoURL
            ? <img className="chatPersonAvatar" src={person.photoURL} alt="" />
            : <span className="chatPersonAvatarFallback" aria-hidden="true">{getInitials(person.displayName)}</span>}
          <span className="chatPersonCopy">
            <strong>{person.displayName || "Conversation"}</strong>
            <span>View profile</span>
          </span>
        </Link>
      ) : (
        <div className="chatWelcome">
          <span className="eyebrow">A LITTLE MORE HUMAN</span>
          <h2>Your conversations, your people.</h2>
          <p>Choose a conversation or search for someone new to say hello.</p>
        </div>
      )}
    </div>
    {data.chatId ? <><Messages /><Input /></> : <div className="chatEmptyArt" aria-hidden="true"><span>✳</span></div>}
  </div>;
};
export default Chat;
