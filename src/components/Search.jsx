import React, { useContext, useEffect, useState } from "react";
import { collection, doc, getDocs, limit, query, runTransaction, serverTimestamp, where } from "firebase/firestore";
import { Link } from "react-router-dom";
import { db } from "../firebase";
import { AuthContext } from "../context/AuthContext";
import { ChatContext } from "../context/ChatContext";
import { getChatId } from "../utils/chat";

const Search = () => {
  const [term, setTerm] = useState("");
  const [users, setUsers] = useState([]);
  const [err, setErr] = useState("");
  const [searching, setSearching] = useState(false);
  const [selectingUid, setSelectingUid] = useState(null);
  const { currentUser } = useContext(AuthContext);
  const { dispatch } = useContext(ChatContext);

  useEffect(() => {
    const normalized = term.trim().toLowerCase();
    let active = true;
    setUsers([]);
    setErr("");
    if (!normalized || !currentUser?.uid) { setSearching(false); return undefined; }
    const timeout = setTimeout(async () => {
      setSearching(true);
      try {
        const profiles = collection(db, "publicProfiles");
        const [names, usernames] = await Promise.all([
          getDocs(query(profiles, where("displayNameLower", ">=", normalized), where("displayNameLower", "<=", normalized + "\uf8ff"), limit(100))),
          getDocs(query(profiles, where("username", ">=", normalized), where("username", "<=", normalized + "\uf8ff"), limit(100)))
        ]);
        if (!active) return;
        const byUid = new Map();
        [...names.docs, ...usernames.docs].forEach(snapshot => {
          const profile = snapshot.data();
          const nameMatch = typeof profile.displayNameLower === "string" && profile.displayNameLower.startsWith(normalized);
          const usernameMatch = typeof profile.username === "string" && profile.username.toLowerCase().startsWith(normalized);
          if (profile.uid && profile.uid !== currentUser.uid && profile.discoverable !== false && (nameMatch || usernameMatch)) byUid.set(profile.uid, profile);
        });
        const matches = [...byUid.values()].sort((a,b) => (a.displayName || "").localeCompare(b.displayName || "")).slice(0,10);
        setUsers(matches);
        if (!matches.length) setErr("No people found. Try a name or @username.");
      } catch (error) {
        console.error("User search failed:", error);
        if (active) setErr(error.code === "permission-denied" ? "You don't have permission to search right now." : "Search is temporarily unavailable. Please try again.");
      } finally { if (active) setSearching(false); }
    }, 250);
    return () => { active = false; clearTimeout(timeout); };
  }, [term, currentUser?.uid]);

  const handleSelect = async selected => {
    if (!currentUser?.uid || !selected?.uid || selectingUid) return;
    setSelectingUid(selected.uid); setErr("");
    const chatId = getChatId(currentUser.uid, selected.uid);
    if (!chatId) { setErr("This conversation could not be opened."); setSelectingUid(null); return; }
    try {
      const chatRef = doc(db, "chats", chatId);
      const mineRef = doc(db, "users", currentUser.uid, "userChats", chatId);
      const theirsRef = doc(db, "users", selected.uid, "userChats", chatId);
      const mineProfileRef = doc(db, "publicProfiles", currentUser.uid);
      const theirProfileRef = doc(db, "publicProfiles", selected.uid);
      const participants = [currentUser.uid, selected.uid].sort();
      await runTransaction(db, async transaction => {
        const [chat, mineEntry, theirEntry, mineProfile, theirProfile] = await Promise.all([
          transaction.get(chatRef), transaction.get(mineRef), transaction.get(theirsRef),
          transaction.get(mineProfileRef), transaction.get(theirProfileRef)
        ]);
        if (!mineProfile.exists() || !theirProfile.exists()) throw new Error("A profile is no longer available.");
        const mine = mineProfile.data(), theirs = theirProfile.data();
        if (theirs.discoverable === false) throw new Error("This profile is no longer discoverable.");
        if (chat.exists()) {
          const existing = chat.data().participants || [];
          if (existing.length !== 2 || !participants.every(uid => existing.includes(uid))) throw new Error("Conversation participants do not match.");
        } else transaction.set(chatRef, { participants, messages: [] });
        const mineInfo = { uid: currentUser.uid, displayName: mine.displayName || currentUser.displayName || "", photoURL: mine.photoURL || "" };
        const theirInfo = { uid: selected.uid, displayName: theirs.displayName || selected.displayName || "", photoURL: theirs.photoURL || selected.photoURL || "" };
        if (!mineEntry.exists()) transaction.set(mineRef, { userInfo: theirInfo, date: serverTimestamp(), unreadCount: 0 });
        if (!theirEntry.exists()) transaction.set(theirRef, { userInfo: mineInfo, date: serverTimestamp(), unreadCount: 0 });
      });
      dispatch({ type: "CHANGE_USER", payload: selected });
      setUsers([]); setTerm("");
    } catch (error) {
      console.error("Unable to open conversation:", error);
      setErr(error.message === "This profile is no longer discoverable." ? error.message : "Could not open this conversation. Please try again.");
    } finally { setSelectingUid(null); }
  };

  return <section className="search" aria-label="Find people">
    <label className="searchLabel" htmlFor="people-search">Find your people</label>
    <div className="searchForm"><span className="searchGlyph" aria-hidden="true">⌕</span>
      <input id="people-search" type="search" placeholder="Search name or @username…" aria-label="Search people by name or username" autoComplete="off" onChange={event => setTerm(event.target.value)} value={term} />
      {term && <button type="button" className="clearSearch" aria-label="Clear search" onClick={() => setTerm("")}>×</button>}
    </div>
    {searching && <p className="searchStatus" role="status">Looking for people…</p>}
    {!searching && err && <p className="searchStatus" role="status">{err}</p>}
    {users.length > 0 && <div className="searchResults" aria-label="Search results">
      {users.map(user => <div className="userChat searchResult" key={user.uid}>
        <img src={user.photoURL || undefined} alt="" />
        <span className="userChatInfo"><Link className="personName" to={`/profile/${user.uid}`}>{user.displayName || "Third Wheel member"}</Link><span className="personHint">{user.username ? `@${user.username}` : "Community member"}</span></span>
        <button type="button" className="startChatButton" onClick={() => handleSelect(user)} disabled={Boolean(selectingUid)}>{selectingUid === user.uid ? "Opening…" : "Say hello"}</button>
      </div>)}
    </div>}
  </section>;
};
export default Search;
