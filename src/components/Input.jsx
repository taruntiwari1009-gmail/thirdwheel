import React, { useContext, useEffect, useRef, useState } from "react";
import Img from "../img/img.png";
import { AuthContext } from "../context/AuthContext";
import { ChatContext } from "../context/ChatContext";
import { v4 as uuid } from "uuid";
import { hasMessageContent, isAllowedImage } from "../utils/chat";
import { sendMessage } from "../services/backend";

const Input = () => {
  const [text, setText] = useState("");
  const [img, setImg] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const pendingSend = useRef(null);
  const { currentUser } = useContext(AuthContext);
  const { data } = useContext(ChatContext);

  useEffect(() => {
    if (!img) { setPreviewUrl(""); return undefined; }
    const url = URL.createObjectURL(img);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [img]);

  useEffect(() => {
    setText(""); setImg(null); setError(""); pendingSend.current = null;
    const fileInput = document.getElementById("file");
    if (fileInput) fileInput.value = "";
  }, [data.chatId]);

  const handleImageSelect = event => {
    const file = event.target.files?.[0];
    if (!file) { setImg(null); return; }
    if (!isAllowedImage(file)) {
      setImg(null); event.target.value = "";
      setError("Choose a valid image smaller than 5 MB."); return;
    }
    setError(""); setImg(file);
  };

  const handleSend = async event => {
    event.preventDefault();
    if (sending || !hasMessageContent(text, img)) return;
    if (!currentUser?.uid || !data.chatId || !data.user?.uid) {
      setError("Select a conversation before sending a message."); return;
    }
    const messageText = text.trim();
    if (messageText.length > 4000) { setError("Messages must be 4,000 characters or fewer."); return; }
    setSending(true); setError("");
    const signature = JSON.stringify([data.chatId, currentUser.uid, data.user.uid, messageText, img ? [img.name, img.size, img.lastModified, img.type] : null]);
    if (!pendingSend.current || pendingSend.current.signature !== signature) {
      pendingSend.current = { signature, id: uuid() };
    }
    try {
      await sendMessage({
        conversationId: data.chatId,
        senderId: currentUser.uid,
        text: messageText,
        image: img,
        clientMessageId: pendingSend.current.id,
      });
      pendingSend.current = null;
      setText(""); setImg(null);
      const fileInput = document.getElementById("file");
      if (fileInput) fileInput.value = "";
    } catch (sendError) {
      console.error("Unable to send message:", sendError);
      setError(sendError.message || "Message could not be sent. Please try again.");
    } finally { setSending(false); }
  };

  return <form className="input" onSubmit={handleSend}>
    <input type="text" placeholder="Write a message…" aria-label="Message" onChange={event => setText(event.target.value)} value={text} maxLength={4000} />
    <div className="send">
      <input type="file" accept="image/*" id="file" className="attachmentInput" onChange={handleImageSelect} aria-label="Choose an image attachment" />
      <label htmlFor="file" className="attachmentButton" title="Attach an image"><img src={Img} alt="" /><span>Photo</span></label>
      <button type="submit" disabled={sending || !hasMessageContent(text, img)}>{sending ? "Sending…" : error ? "Retry send" : "Send"}</button>
    </div>
    {img && <div className="attachmentPreview"><img src={previewUrl} alt="Selected attachment" /><span>{sending ? "Uploading image…" : `Image ready: ${img.name}`}</span><button type="button" onClick={() => { setImg(null); pendingSend.current = null; const fileInput = document.getElementById("file"); if (fileInput) fileInput.value = ""; }}>Remove</button></div>}
    {error && <span role="alert">{error}</span>}
  </form>;
};
export default Input;
