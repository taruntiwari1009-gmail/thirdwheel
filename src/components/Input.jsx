import React, { useContext, useState } from "react";
import Img from "../img/img.png";
import Attach from "../img/attach.png";
import { AuthContext } from "../context/AuthContext";
import { ChatContext } from "../context/ChatContext";
import {
  arrayUnion,
  doc,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { db, storage } from "../firebase";
import { v4 as uuid } from "uuid";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";

const Input = () => {
  const [text, setText] = useState("");
  const [img, setImg] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const { currentUser } = useContext(AuthContext);
  const { data } = useContext(ChatContext);

  const handleSend = async (event) => {
    event.preventDefault();
    if (sending || (!text.trim() && !img)) return;
    if (!currentUser?.uid || !data.chatId || !data.user?.uid) {
      setError("Select a conversation before sending a message.");
      return;
    }

    setSending(true);
    setError("");

    try {
      let imageUrl = "";
      if (img) {
        const storageRef = ref(storage, `chat-images/${uuid()}-${img.name}`);
        const uploadTask = uploadBytesResumable(storageRef, img);
        await uploadTask;
        imageUrl = await getDownloadURL(uploadTask.snapshot.ref);
      }

      const messageText = text.trim();
      await updateDoc(doc(db, "chats", data.chatId), {
        messages: arrayUnion({
          id: uuid(),
          text: messageText,
          senderId: currentUser.uid,
          date: Timestamp.now(),
          ...(imageUrl ? { img: imageUrl } : {}),
        }),
      });

      const lastMessage = { text: messageText || (imageUrl ? "Image" : "") };
      await Promise.all([
        updateDoc(doc(db, "userChats", currentUser.uid), {
          [data.chatId + ".lastMessage"]: lastMessage,
          [data.chatId + ".date"]: serverTimestamp(),
        }),
        updateDoc(doc(db, "userChats", data.user.uid), {
          [data.chatId + ".lastMessage"]: lastMessage,
          [data.chatId + ".date"]: serverTimestamp(),
        }),
      ]);

      setText("");
      setImg(null);
    } catch (sendError) {
      console.error("Unable to send message:", sendError);
      setError("Message could not be sent. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <form className="input" onSubmit={handleSend}>
      <input
        type="text"
        placeholder="Type something..."
        onChange={(event) => setText(event.target.value)}
        value={text}
      />
      <div className="send">
        <img src={Attach} alt="" />
        <input
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          id="file"
          onChange={(event) => setImg(event.target.files?.[0] || null)}
        />
        <label htmlFor="file">
          <img src={Img} alt="Choose an image" />
        </label>
        <button type="submit" disabled={sending}>
          {sending ? "Sending..." : "Send"}
        </button>
      </div>
      {error && <span role="alert">{error}</span>}
    </form>
  );
};

export default Input;
