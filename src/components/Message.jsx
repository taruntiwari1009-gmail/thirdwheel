import React, { useContext, useEffect, useRef } from "react";
import { AuthContext } from "../context/AuthContext";
import { ChatContext } from "../context/ChatContext";

const Message = ({ message }) => {
  const { currentUser } = useContext(AuthContext);
  const { data } = useContext(ChatContext);
  const ref = useRef();
  const isOwner = message.senderId === currentUser?.uid;

  useEffect(() => {
    ref.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [message]);

  const avatar = isOwner ? currentUser?.photoURL : data.user?.photoURL;

  return (
    <div ref={ref} className={`message ${isOwner ? "owner" : ""}`}>
      <div className="messageInfo">
        {avatar && <img src={avatar} alt="" />}
        <span>{message.date?.toDate ? message.date.toDate().toLocaleString() : "Just now"}</span>
      </div>
      <div className="messageContent">
        {message.text && <p>{message.text}</p>}
        {message.img && <img src={message.img} alt="Shared attachment" />}
      </div>
    </div>
  );
};

export default Message;
