import { collection, deleteDoc, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import React, { useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { ChatContext } from "../context/ChatContext";
import { db } from "../firebase";

const Chats = () => {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState("");
  const { currentUser } = useContext(AuthContext);
  const { dispatch, data } = useContext(ChatContext);

  useEffect(() => {
    if (!currentUser?.uid) { setChats([]); setLoading(false); setError(""); return undefined; }
    setChats([]); setLoading(true); setError("");
    const chatsQuery = query(collection(db, "users", currentUser.uid, "userChats"), orderBy("date", "desc"));
    return onSnapshot(chatsQuery, snapshot => {
      setChats(snapshot.docs.map(chatDoc => ({ chatId: chatDoc.id, ...chatDoc.data() })));
      setLoading(false); setError("");
    }, listenerError => {
      console.error("Unable to load conversations:", listenerError);
      setLoading(false); setError("Your conversations could not be loaded. Please refresh.");
    });
  }, [currentUser?.uid]);

  const handleRemove = async (event, chatId) => {
    event.stopPropagation();
    if (!currentUser?.uid || removing) return;
    if (!window.confirm("Remove this conversation from your inbox? The other person will keep their copy.")) return;
    setRemoving(chatId);
    try {
      await deleteDoc(doc(db, "users", currentUser.uid, "userChats", chatId));
      if (data.chatId === chatId) dispatch({ type: "RESET" });
    } catch (removeError) {
      console.error("Unable to remove conversation:", removeError);
      setError("This conversation could not be removed. Please try again.");
    } finally { setRemoving(""); }
  };

  return <div className="chats">
    <div className="inboxHeading"><span>Messages</span><span>{chats.length}</span></div>
    {loading && <><p role="status">Loading conversations…</p><div className="conversationSkeletons" aria-hidden="true">{[1,2,3].map(item => <div className="conversationSkeleton" key={item}><span /><i /><b /></div>)}</div></>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && chats.length === 0 && <p className="inboxEmpty">Your inbox is waiting. Search for someone to start a conversation.</p>}
    {chats.map(chat => <div className={`chatListItemWrap ${data.chatId === chat.chatId ? "active" : ""}`} key={chat.chatId}>
      <button type="button" className="userChat chatListItem" onClick={() => chat.userInfo?.uid && dispatch({ type: "CHANGE_USER", payload: chat.userInfo })}>
        {chat.userInfo?.photoURL ? <img src={chat.userInfo.photoURL} alt="" /> : <span className="avatarFallback" aria-hidden="true">{(chat.userInfo?.displayName || "C").trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()}</span>}
        <span className="userChatInfo"><span>{chat.userInfo?.displayName || "Conversation"}</span><span className="chatPreview">{chat.lastMessage?.text || "Start a conversation"}</span></span>
        {Number(chat.unreadCount) > 0 && <span className="unreadBadge" aria-label={`${chat.unreadCount} unread messages`}>{chat.unreadCount > 9 ? "9+" : chat.unreadCount}</span>}
      </button>
      <Link className="chatProfileLink" to={`/profile/${chat.userInfo?.uid}`} aria-label="View profile">↗</Link>
      <button className="removeChatButton" type="button" onClick={event => handleRemove(event, chat.chatId)} disabled={removing === chat.chatId} aria-label="Remove conversation from inbox" title="Remove from inbox">×</button>
    </div>)}
  </div>;
};
export default Chats;
