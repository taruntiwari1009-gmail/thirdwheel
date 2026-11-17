import React, { useContext } from "react";
import { AuthContext } from "../context/AuthContext";
import { ChatContext } from "../context/ChatContext";

const Message = ({ message, deleted = false }) => {
  const { currentUser } = useContext(AuthContext);
  const { data } = useContext(ChatContext);
  const isOwner = message.senderId === currentUser?.uid;
  const avatar = deleted ? "" : isOwner ? currentUser?.photoURL : data.user?.photoURL;
  const date = message.date?.toDate ? message.date.toDate() : null;
  return <div className={`message ${isOwner ? "owner" : ""}`}>
    <div className="messageInfo">{avatar && <img src={avatar} alt="" />}{deleted && <span className="deletedAccountLabel">Deleted account</span>}<span>{date ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Just now"}</span></div>
    <div className="messageContent">
      {message.text && <p>{message.text}</p>}
      {message.img && <a href={message.img} target="_blank" rel="noreferrer"><img src={message.img} alt="Shared attachment" loading="lazy" /></a>}
    </div>
  </div>;
};
export default Message;
