import React, { useContext, useEffect, useRef, useState } from "react";
import Img from "../img/img.png";
import { AuthContext } from "../context/AuthContext";
import { ChatContext } from "../context/ChatContext";
import { doc, runTransaction, serverTimestamp, Timestamp } from "firebase/firestore";
import { db, storage } from "../firebase";
import { v4 as uuid } from "uuid";
import { ref, uploadBytesResumable } from "firebase/storage";
import { hasMessageContent, isAllowedImage } from "../utils/chat";

const Input = () => {
  const [text, setText] = useState("");
  const [img, setImg] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
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
    setText("");
    setImg(null);
    setError("");
    setUploadProgress(0);
    pendingSend.current = null;
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
      pendingSend.current = { signature, id: uuid(), imagePath: "" };
    }
    try {
      let imagePath = pendingSend.current.imagePath;
      if (img && !imagePath) {
        const safeFileName = img.name.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 100) || "attachment";
        const storageRef = ref(storage, `chat-images/${data.chatId}/${currentUser.uid}/${pendingSend.current.id}-${safeFileName}`);
        const uploadTask = uploadBytesResumable(storageRef, img);
        await new Promise((resolve, reject) => {
          uploadTask.on("state_changed",
            snapshot => setUploadProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)),
            reject,
            () => resolve(uploadTask.snapshot)
          );
        });
        imagePath = storageRef.fullPath;
        pendingSend.current.imagePath = imagePath;
      }

      const messageId = pendingSend.current.id;
      const messageRef = doc(db, "chats", data.chatId, "messages", messageId);
      const chatRef = doc(db, "chats", data.chatId);
      const mineRef = doc(db, "users", currentUser.uid, "userChats", data.chatId);
      const theirsRef = doc(db, "users", data.user.uid, "userChats", data.chatId);
      const mineInfo = { uid: currentUser.uid, displayName: currentUser.displayName || "", photoURL: currentUser.photoURL || "" };
      const theirInfo = { uid: data.user.uid, displayName: data.user.displayName || "", photoURL: data.user.photoURL || "" };
      const lastMessage = { text: messageText || "Image" };

      await runTransaction(db, async transaction => {
        const rateLimitRef = doc(db, "abuseLimits", `messages_${currentUser.uid}`);
        const [chat, existingMessage, mine, theirs, rateLimit] = await Promise.all([transaction.get(chatRef), transaction.get(messageRef), transaction.get(mineRef), transaction.get(theirsRef), transaction.get(rateLimitRef)]);
        if (!chat.exists()) throw new Error("This conversation no longer exists.");
        const chatData = chat.data();
        const participants = chatData.participants || [];
        if (!participants.includes(currentUser.uid) || !participants.includes(data.user.uid)) throw new Error("You are no longer a participant in this conversation.");
        if (existingMessage.exists()) return;
        const now = Timestamp.now();
        const previousLimit = rateLimit.exists() ? rateLimit.data() : null;
        const resetWindow = !previousLimit || !previousLimit.windowStart
          || now.toMillis() - previousLimit.windowStart.toMillis() >= 60000;
        const nextCount = resetWindow ? 1 : Number(previousLimit.count || 0) + 1;
        if (nextCount > 8) throw new Error("You're sending messages too quickly. Please wait a moment and try again.");
        transaction.set(rateLimitRef, {
          uid: currentUser.uid,
          count: nextCount,
          windowStart: resetWindow ? serverTimestamp() : previousLimit.windowStart,
          updatedAt: serverTimestamp(),
        });
        transaction.set(messageRef, {
          id: messageId,
          text: messageText,
          senderId: currentUser.uid,
          date: serverTimestamp(),
          ...(imagePath ? { img: imagePath } : {}),
        });
        const date = serverTimestamp();
        const minePatch = { lastMessage, date, unreadCount: 0, lastReadAt: date };
        const theirPatch = { lastMessage, date, unreadCount: Number(theirs.data()?.unreadCount || 0) + 1 };
        if (mine.exists()) transaction.update(mineRef, minePatch);
        else transaction.set(mineRef, { userInfo: theirInfo, ...minePatch });
        if (theirs.exists()) transaction.update(theirsRef, theirPatch);
        else transaction.set(theirsRef, { userInfo: mineInfo, ...theirPatch });
      });
      pendingSend.current = null;
      setText(""); setImg(null); setUploadProgress(0);
      const fileInput = document.getElementById("file");
      if (fileInput) fileInput.value = "";
    } catch (sendError) {
      console.error("Unable to send message:", sendError);
      setError(sendError.message || "Message could not be sent. Please try again. Your message is still available to retry.");
    } finally { setSending(false); }
  };

  return <form className="input" onSubmit={handleSend}>
    <input type="text" placeholder="Write a message…" aria-label="Message" onChange={event => setText(event.target.value)} value={text} maxLength={4000} />
    <div className="send">
      <input type="file" accept="image/*" id="file" className="attachmentInput" onChange={handleImageSelect} aria-label="Choose an image attachment" />
      <label htmlFor="file" className="attachmentButton" title="Attach an image"><img src={Img} alt="" /><span>Photo</span></label>
      <button type="submit" disabled={sending || !hasMessageContent(text, img)}>{sending ? "Sending…" : error ? "Retry send" : "Send"}</button>
    </div>
    {img && <div className="attachmentPreview"><img src={previewUrl} alt="Selected attachment" /><span>{sending ? `Uploading image… ${uploadProgress}%` : `Image ready: ${img.name}`}</span><button type="button" onClick={() => { setImg(null); setUploadProgress(0); pendingSend.current = null; const fileInput = document.getElementById("file"); if (fileInput) fileInput.value = ""; }}>Remove</button></div>}
    {error && <span role="alert">{error}</span>}
  </form>;
};
export default Input;
