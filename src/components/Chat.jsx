import React, { useContext } from "react";
import Messages from "./Messages";
import Input from "./Input";
import { ChatContext } from "../context/ChatContext";
import { Link } from "react-router-dom";

const Chat = () => {
  const { data } = useContext(ChatContext);
  return <div className={`chat ${data.chatId ? "hasConversation" : "emptyConversation"}`}>
    <div className="chatInfo">
      {data.user?.uid ? <Link to={`/profile/${data.user.uid}`} className="chatPerson">{data.user.displayName || "Conversation"}<span>View profile</span></Link> : <div className="chatWelcome"><span className="eyebrow">A LITTLE MORE HUMAN</span><h2>Your conversations, your people.</h2><p>Choose a conversation or search for someone new to say hello.</p></div>}
    </div>
    {data.chatId ? <><Messages /><Input /></> : <div className="chatEmptyArt" aria-hidden="true"><span>✳</span></div>}
  </div>;
};
export default Chat;
