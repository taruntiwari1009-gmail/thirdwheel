import React, { useContext, useEffect, useRef, useState } from "react";
import { collection, doc, getDocs, limit, query, runTransaction, serverTimestamp, startAfter, where } from "firebase/firestore";
import { Link } from "react-router-dom";
import { db } from "../firebase";
import { AuthContext } from "../context/AuthContext";
import { ChatContext } from "../context/ChatContext";
import { getChatId } from "../utils/chat";

const PAGE_SIZE = 30;
// Firestore rules require discoverable=true for non-owner profile reads.

const mergeMatches = (snapshots, normalized, existing, currentUid, blockedUids = []) => {
  const byUid = new Map((existing || []).map(user => [user.uid, user]));
  snapshots.forEach(snapshot => {
    const profile = snapshot.data();
    const displayNameLower = typeof profile.displayNameLower === "string"
      ? profile.displayNameLower
      : typeof profile.displayName === "string" ? profile.displayName.toLowerCase() : "";
    const username = typeof profile.username === "string" ? profile.username.toLowerCase() : "";
    const matches = displayNameLower.startsWith(normalized) || username.startsWith(normalized);
    if (profile.uid && profile.uid !== currentUid && !blockedUids.includes(profile.uid) && profile.discoverable !== false && matches) {
      byUid.set(profile.uid, profile);
    }
  });
  return Array.from(byUid.values()).sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
};

const Search = () => {
  const [term, setTerm] = useState("");
  const [users, setUsers] = useState([]);
  const [err, setErr] = useState("");
  const [searching, setSearching] = useState(false);
  const [selectingUid, setSelectingUid] = useState(null);
  const [cursors, setCursors] = useState({ names: null, usernames: null });
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [visibleCount, setVisibleCount] = useState(10);
  const [blockedUids, setBlockedUids] = useState([]);
  const searchGeneration = useRef(0);
  const { currentUser } = useContext(AuthContext);
  const { dispatch } = useContext(ChatContext);

  useEffect(() => {
    const normalized = term.trim().toLowerCase().replace(/^@/, "");
    searchGeneration.current += 1;
    let active = true;
    setUsers([]);
    setBlockedUids([]);
    setCursors({ names: null, usernames: null });
    setHasMore(false);
    setLoadingMore(false);
    setVisibleCount(10);
    setErr("");
    if (!normalized || !currentUser?.uid) {
      setSearching(false);
      return undefined;
    }

    const timeout = setTimeout(async () => {
      setSearching(true);
      try {
        const profiles = collection(db, "publicProfiles");
        const blockedSnapshot = await getDocs(collection(db, "users", currentUser.uid, "blockedUsers"));
        const blocked = blockedSnapshot.docs.map(item => item.id);
        if (!active) return;
        setBlockedUids(blocked);
        // Each query ranges over one field only. This uses Firestore's automatic
        // single-field indexes and does not depend on a deployed composite index.
        const [names, usernames] = await Promise.all([
          getDocs(query(
            profiles,
            where("discoverable", "==", true),
            where("displayNameLower", ">=", normalized),
            where("displayNameLower", "<=", normalized + "\uf8ff"),
            limit(PAGE_SIZE)
          )),
          getDocs(query(
            profiles,
            where("discoverable", "==", true),
            where("username", ">=", normalized),
            where("username", "<=", normalized + "\uf8ff"),
            limit(PAGE_SIZE)
          ))
        ]);
        if (!active) return;
        setCursors({
          names: names.docs.length === PAGE_SIZE ? names.docs[names.docs.length - 1] : null,
          usernames: usernames.docs.length === PAGE_SIZE ? usernames.docs[usernames.docs.length - 1] : null
        });
        setHasMore(names.docs.length === PAGE_SIZE || usernames.docs.length === PAGE_SIZE);
        const matches = mergeMatches([...names.docs, ...usernames.docs], normalized, [], currentUser.uid, blocked);
        setUsers(matches);
        if (!matches.length) setErr("No people found. Try a name or @username.");
      } catch (error) {
        console.error("User search failed:", error);
        if (!active) return;
        if (error.code === "permission-denied") {
          setErr("You don't have permission to search right now. Please sign in again.");
        } else if (error.code === "unavailable" || error.code === "deadline-exceeded") {
          setErr("Search is temporarily unavailable. Check your connection and try again.");
        } else {
          setErr("Search could not be completed. Please try again.");
        }
      } finally {
        if (active) setSearching(false);
      }
    }, 250);

    return () => { active = false; clearTimeout(timeout); };
  }, [term, currentUser]);

  const loadMore = async () => {
    if (loadingMore || !hasMore || !currentUser?.uid) return;
    const generation = searchGeneration.current;
    if (users.length > visibleCount) {
      setVisibleCount(count => count + 10);
      return;
    }
    const normalized = term.trim().toLowerCase().replace(/^@/, "");
    if (!normalized) return;
    setLoadingMore(true);
    try {
      const profiles = collection(db, "publicProfiles");
      const [names, usernames] = await Promise.all([
        cursors.names ? getDocs(query(
          profiles,
          where("discoverable", "==", true),
            where("displayNameLower", ">=", normalized),
          where("displayNameLower", "<=", normalized + "\uf8ff"),
          startAfter(cursors.names),
          limit(PAGE_SIZE)
        )) : Promise.resolve({ docs: [] }),
        cursors.usernames ? getDocs(query(
          profiles,
          where("discoverable", "==", true),
            where("username", ">=", normalized),
          where("username", "<=", normalized + "\uf8ff"),
          startAfter(cursors.usernames),
          limit(PAGE_SIZE)
        )) : Promise.resolve({ docs: [] })
      ]);
      if (generation !== searchGeneration.current) return;
      setUsers(previous => mergeMatches([...names.docs, ...usernames.docs], normalized, previous, currentUser.uid, blockedUids));
      setCursors({
        names: names.docs.length === PAGE_SIZE ? names.docs[names.docs.length - 1] : null,
        usernames: usernames.docs.length === PAGE_SIZE ? usernames.docs[usernames.docs.length - 1] : null
      });
      setHasMore(names.docs.length === PAGE_SIZE || usernames.docs.length === PAGE_SIZE);
      setVisibleCount(count => count + 10);
    } catch (error) {
      console.error("Unable to load more search results:", error);
      if (generation === searchGeneration.current) setErr("More people could not be loaded. Please try again.");
    } finally {
      if (generation === searchGeneration.current) setLoadingMore(false);
    }
  };

  const handleSelect = async selected => {
    if (!currentUser?.uid || !selected?.uid || selectingUid) return;
    setSelectingUid(selected.uid);
    setErr("");
    const chatId = getChatId(currentUser.uid, selected.uid);
    if (!chatId) {
      setErr("This conversation could not be opened.");
      setSelectingUid(null);
      return;
    }

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
        const mine = mineProfile.data();
        const theirs = theirProfile.data();
        if (theirs.discoverable === false) throw new Error("This profile is no longer discoverable.");
        if (chat.exists()) {
          const existing = chat.data().participants || [];
          if (existing.length !== 2 || !participants.every(uid => existing.includes(uid))) {
            throw new Error("Conversation participants do not match.");
          }
        } else {
          transaction.set(chatRef, { participants });
        }
        const mineInfo = {
          uid: currentUser.uid,
          displayName: mine.displayName || currentUser.displayName || "",
          photoURL: mine.photoURL || ""
        };
        const theirInfo = {
          uid: selected.uid,
          displayName: theirs.displayName || selected.displayName || "",
          photoURL: theirs.photoURL || selected.photoURL || ""
        };
        if (!mineEntry.exists()) transaction.set(mineRef, { userInfo: theirInfo, date: serverTimestamp(), unreadCount: 0 });
        if (!theirEntry.exists()) transaction.set(theirsRef, { userInfo: mineInfo, date: serverTimestamp(), unreadCount: 0 });
      });
      dispatch({ type: "CHANGE_USER", payload: selected });
      setUsers([]);
      setTerm("");
    } catch (error) {
      console.error("Unable to open conversation:", error);
      setErr(error.message === "This profile is no longer discoverable."
        ? error.message
        : "Could not open this conversation. Please try again.");
    } finally {
      setSelectingUid(null);
    }
  };

  return <section className="search" aria-label="Find people">
    <label className="searchLabel" htmlFor="people-search">Find your people</label>
    <div className="searchForm">
      <span className="searchGlyph" aria-hidden="true">⌕</span>
      <input
        id="people-search"
        type="search"
        placeholder="Search name or @username…"
        aria-label="Search people by name or username"
        autoComplete="off"
        onChange={event => setTerm(event.target.value)}
        value={term}
      />
      {term && <button type="button" className="clearSearch" aria-label="Clear search" onClick={() => setTerm("")}>×</button>}
    </div>
    {searching && <><p className="searchStatus" role="status">Looking for people…</p><div className="searchSkeletons" aria-hidden="true">{[1, 2].map(item => <div className="searchSkeleton" key={item}><span /><i /><b /></div>)}</div></>}
    {!searching && err && <p className="searchStatus" role="status">{err}</p>}
    {users.length > 0 && <div className="searchResults" aria-label="Search results">
      {users.slice(0, visibleCount).map(user => <div className="userChat searchResult" key={user.uid}>
        {user.photoURL ? <img src={user.photoURL} alt="" /> : <span className="avatarFallback" aria-hidden="true">{(user.displayName || "T").trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()}</span>}
        <span className="userChatInfo">
          <Link className="personName" to={"/profile/" + user.uid}>{user.displayName || "Third Wheel member"}</Link>
          <span className="personHint">{[
            user.username ? "@" + user.username : "",
            user.city || "",
            (Array.isArray(user.interests) ? user.interests : []).slice(0, 2).join(" · ")
          ].filter(Boolean).join(" · ") || "Community member"}</span>
        </span>
        <button type="button" className="startChatButton" onClick={() => handleSelect(user)} disabled={Boolean(selectingUid)}>
          {selectingUid === user.uid ? "Opening…" : "Say hello"}
        </button>
      </div>)}
      {(users.length > visibleCount || hasMore) && <button type="button" className="loadMoreResults" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading…" : "Show more people"}</button>}
    </div>}
  </section>;
};

export default Search;
