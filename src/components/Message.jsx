import React, { useContext, useEffect, useState } from "react";
import { AuthContext } from "../context/AuthContext";
import { ChatContext } from "../context/ChatContext";
import { getSignedAssetUrl } from "../services/backend";

const Message = ({ message, deleted = false, receipt = "" }) => {
  const { currentUser } = useContext(AuthContext);
  const { data } = useContext(ChatContext);
  const isOwner = message.senderId === currentUser?.uid;
  const avatar = deleted ? "" : isOwner ? currentUser?.photoURL : data.user?.photoURL;
  const dateValue = message.created_at || message.date;
  const date = dateValue ? new Date(dateValue) : null;
  const [imageUrl, setImageUrl] = useState("");
  const [imageState, setImageState] = useState(message.attachment_path || message.img ? "loading" : "none");

  useEffect(() => {
    let active = true;
    const path = message.attachment_path || message.img;
    if (!path) {
      setImageUrl(""); setImageState("none");
      return undefined;
    }
    setImageUrl(""); setImageState("loading");
    getSignedAssetUrl("chat-images", path).then(url => {
      if (active) { setImageUrl(url); setImageState(url ? "ready" : "unavailable"); }
    }).catch(error => {
      console.warn("Unable to load private chat attachment:", error);
      if (active) setImageState("unavailable");
    });
    return () => { active = false; };
  }, [message.attachment_path, message.img]);

  return <div className={`message ${isOwner ? "owner" : ""}`}>
    <div className="messageInfo">{avatar && <img src={avatar} alt="" />}{deleted && <span className="deletedAccountLabel">Deleted account</span>}<span>{date && !Number.isNaN(date.getTime()) ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Just now"}</span></div>
    <div className="messageContent">
      {(message.body || message.text) && <p>{message.body || message.text}</p>}
      {(message.attachment_path || message.img) && (imageState === "ready"
        ? <a href={imageUrl} target="_blank" rel="noreferrer"><img src={imageUrl} alt="Shared attachment" loading="lazy" /></a>
        : <span className="attachmentLoadState" role="status">{imageState === "loading" ? "Loading secure attachment…" : "Attachment unavailable"}</span>)}
      {isOwner && receipt && <span className={`messageReceipt ${receipt === "Seen" ? "seen" : ""}`} aria-label={receipt}>{receipt}</span>}
    </div>
  </div>;
};
export default Message;
