import React, { useContext, useState } from "react";
import Img from "../img/img.png";
import Attach from "../img/attach.png";
import { AuthContext } from "../context/AuthContext";
import { ChatContext } from "../context/ChatContext";
import {
  arrayUnion,
  doc,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db, storage } from "../firebase";
import { v4 as uuid } from "uuid";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { hasMessageContent, isAllowedImage } from "../utils/chat";

const Input = () => {
  const [text, setText] = useState("");
  const [img, setImg] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const { currentUser } = useContext(AuthContext);
  const { data } = useContext(ChatContext);

  const handleImageSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setImg(null);
      return;
    }
    if (!isAllowedImage(file)) {
      setImg(null);
      event.target.value = "";
      setError("Choose a valid image smaller than 5 MB.");
      return;
    }
    setError("");
    setImg(file);
  };

  const handleSend = async (event) => {
    event.preventDefault();
    if (sending || !hasMessageContent(text, img)) return;
    if (!currentUser?.uid || !data.chatId || !data.user?.uid) {
      setError("Select a conversation before sending a message.");
      return;
    }

    const messageText = text.trim();
    if (messageText.length > 4000) {
      setError("Messages must be 4,000 characters or fewer.");
      return;
    }

    setSending(true);
    setError("");

    try {
      let imageUrl = "";
      if (img) {
        try {
          const storageRef = ref(
            storage,
            `chat-images/${data.chatId}/${currentUser.uid}/${uuid()}-${img.name}`
          );
          const uploadTask = uploadBytesResumable(storageRef, img);
          await uploadTask;
          imageUrl = await getDownloadURL(uploadTask.snapshot.ref);
        } catch (uploadError) {
          console.error("Image upload failed:", uploadError);
          throw new Error("Image uploads are currently unavailable. You can still send text messages.");
        }
      }

      const message = {
        id: uuid(),
        text: messageText,
        senderId: currentUser.uid,
        date: Timestamp.now(),
        ...(imageUrl ? { img: imageUrl } : {}),
      };
      const chatRef = doc(db, "chats", data.chatId);
      const currentEntryRef = doc(db, "users", currentUser.uid, "userChats", data.chatId);
      const otherEntryRef = doc(db, "users", data.user.uid, "userChats", data.chatId);
      const lastMessage = { text: messageText || (imageUrl ? "Image" : "") };
      const currentUserInfo = {
        uid: currentUser.uid,
        displayName: currentUser.displayName || "",
        photoURL: currentUser.photoURL || "",
      };
      const otherUserInfo = {
        uid: data.user.uid,
        displayName: data.user.displayName || "",
        photoURL: data.user.photoURL || "",
      };

      // Read all documents first; the transaction either delivers the message and
      // updates both inboxes, or commits none of those changes.
      await runTransaction(db, async (transaction) => {
        const [chatSnapshot, currentEntry, otherEntry] = await Promise.all([
          transaction.get(chatRef),
          transaction.get(currentEntryRef),
          transaction.get(otherEntryRef),
        ]);

        if (!chatSnapshot.exists()) throw new Error("This conversation no longer exists.");
        const participants = chatSnapshot.data().participants || [];
        if (!participants.includes(currentUser.uid) || !participants.includes(data.user.uid)) {
          throw new Error("You are no longer a participant in this conversation.");
        }

        transaction.update(chatRef, { messages: arrayUnion(message) });

        const listPatch = { lastMessage, date: serverTimestamp() };
        if (currentEntry.exists()) {
          transaction.update(currentEntryRef, listPatch);
        } else {
          transaction.set(currentEntryRef, { userInfo: otherUserInfo, ...listPatch });
        }

        if (otherEntry.exists()) {
          transaction.update(otherEntryRef, listPatch);
        } else {
          transaction.set(otherEntryRef, { userInfo: currentUserInfo, ...listPatch });
        }
      });

      setText("");
      setImg(null);
      const fileInput = document.getElementById("file");
      if (fileInput) fileInput.value = "";
    } catch (sendError) {
      console.error("Unable to send message:", sendError);
      setError(sendError.message || "Message could not be sent. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <form className="input" onSubmit={handleSend}>
      <input
        type="text"
        placeholder="Type something..."
        aria-label="Message"
        onChange={(event) => setText(event.target.value)}
        value={text}
        maxLength={4000}
      />
      <div className="send">
        <img src={Attach} alt="" />
        <input
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          id="file"
          onChange={handleImageSelect}
        />
        <label htmlFor="file">
          <img src={Img} alt="Choose an attachment" />
        </label>
        <button type="submit" disabled={sending || !hasMessageContent(text, img)}>
          {sending ? "Sending..." : "Send"}
        </button>
      </div>
      {img && <span>{img.name}</span>}
      {error && <span role="alert">{error}</span>}
    </form>
  );
};

export default Input;
