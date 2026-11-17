import React, { useContext, useEffect, useState } from "react";
import { getBlob, ref } from "firebase/storage";
import { AuthContext } from "../context/AuthContext";
import { ChatContext } from "../context/ChatContext";
import { storage } from "../firebase";

const Message = ({ message, deleted = false, receipt = "" }) => {
  const { currentUser } = useContext(AuthContext);
  const { data } = useContext(ChatContext);
  const isOwner = message.senderId === currentUser?.uid;
  const avatar = deleted ? "" : isOwner ? currentUser?.photoURL : data.user?.photoURL;
  const date = message.date?.toDate ? message.date.toDate() : null;
  const [imageUrl, setImageUrl] = useState("");
  const [imageState, setImageState] = useState(message.img ? "loading" : "none");

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    if (!message.img) {
      setImageUrl("");
      setImageState("none");
      return undefined;
    }
    setImageUrl("");
    setImageState("loading");
    // Message documents store a Storage object path, not a tokenized
    // getDownloadURL URL. SDK reads are authorized by the signed-in user
    // and the chat-images Storage Rules.
    getBlob(ref(storage, message.img)).then(blob => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setImageUrl(objectUrl);
      setImageState("ready");
    }).catch(error => {
      console.warn("Unable to load private chat attachment:", error);
      if (active) setImageState("unavailable");
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [message.img]);

  return <div className={`message ${isOwner ? "owner" : ""}`}>
    <div className="messageInfo">{avatar && <img src={avatar} alt="" />}{deleted && <span className="deletedAccountLabel">Deleted account</span>}<span>{date ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Just now"}</span></div>
    <div className="messageContent">
      {message.text && <p>{message.text}</p>}
      {message.img && (imageState === "ready"
        ? <a href={imageUrl} target="_blank" rel="noreferrer"><img src={imageUrl} alt="Shared attachment" loading="lazy" /></a>
        : <span className="attachmentLoadState" role={imageState === "unavailable" ? "status" : "progressbar"}>{imageState === "loading" ? "Loading secure attachment…" : "Attachment unavailable"}</span>)}
      {isOwner && receipt && <span className={`messageReceipt ${receipt === "Seen" ? "seen" : ""}`} aria-label={receipt}>{receipt}</span>}
    </div>
  </div>;
};
export default Message;
