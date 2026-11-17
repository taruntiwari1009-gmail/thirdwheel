import React, { useContext, useEffect, useState } from "react";
import { collection, doc, getDocs, limit, query, runTransaction, serverTimestamp, where } from "firebase/firestore";
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

    if (!normalized || !currentUser?.uid) {
      setSearching(false);
      return undefined;
    }

    // Query the indexed display-name field alone. The former combination of
    // discoverable + display-name filters required a composite index to be
    // deployed; that caused search to fail in production when it was absent.
    // Public profile fields are readable to signed-in users by design, and
    // discoverability is still enforced before a result is displayed.
    const timeout = setTimeout(async () => {
      setSearching(true);
      try {
        const profilesQuery = query(
          collection(db, "publicProfiles"),
          where("displayNameLower", ">=", normalized),
          where("displayNameLower", "<=", normalized + "\uf8ff"),
          limit(100)
        );
        const snapshot = await getDocs(profilesQuery);
        if (!active) return;

        const matches = snapshot.docs
          .map((profileDoc) => profileDoc.data())
          .filter((profile) =>
            profile.uid !== currentUser.uid &&
            profile.discoverable !== false &&
            typeof profile.displayNameLower === "string" &&
            profile.displayNameLower.startsWith(normalized)
          )
          .slice(0, 10);

        setUsers(matches);
        if (!matches.length) setErr("No people found. Try another name.");
      } catch (error) {
        console.error("User search failed:", error);
        if (active) {
          setErr(error.code === "permission-denied"
            ? "You don't have permission to search right now."
            : "Search is temporarily unavailable. Please try again.");
        }
      } finally {
        if (active) setSearching(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [term, currentUser?.uid]);

  const handleSelect = async (selected) => {
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
      const currentEntryRef = doc(db, "users", currentUser.uid, "userChats", chatId);
      const otherEntryRef = doc(db, "users", selected.uid, "userChats", chatId);
      const currentProfileRef = doc(db, "publicProfiles", currentUser.uid);
      const otherProfileRef = doc(db, "publicProfiles", selected.uid);
      const participants = [currentUser.uid, selected.uid].sort();

      await runTransaction(db, async (transaction) => {
        const [chatSnapshot, currentEntry, otherEntry, currentProfile, otherProfile] = await Promise.all([
          transaction.get(chatRef),
          transaction.get(currentEntryRef),
          transaction.get(otherEntryRef),
          transaction.get(currentProfileRef),
          transaction.get(otherProfileRef)
        ]);

        if (!currentProfile.exists() || !otherProfile.exists()) throw new Error("A profile is no longer available.");
        const mine = currentProfile.data();
        const theirs = otherProfile.data();
        if (theirs.discoverable === false) throw new Error("This profile is no longer discoverable.");

        if (!chatSnapshot.exists()) {
          transaction.set(chatRef, { participants, messages: [] });
        } else {
          const existing = chatSnapshot.data().participants || [];
          if (existing.length !== 2 || !participants.every((uid) => existing.includes(uid))) {
            throw new Error("Conversation participants do not match.");
          }
        }

        const mineInfo = { uid: currentUser.uid, displayName: mine.displayName || currentUser.displayName || "", photoURL: mine.photoURL || "" };
        const theirInfo = { uid: selected.uid, displayName: theirs.displayName || selected.displayName || "", photoURL: theirs.photoURL || selected.photoURL || "" };
        if (!currentEntry.exists()) transaction.set(currentEntryRef, { userInfo: theirInfo, date: serverTimestamp() });
        if (!otherEntry.exists()) transaction.set(otherEntryRef, { userInfo: mineInfo, date: serverTimestamp() });
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

  return (
    <section className="search" aria-label="Find people">
      <label className="searchLabel" htmlFor="people-search">Find your people</label>
      <div className="searchForm">
        <span className="searchGlyph" aria-hidden="true">⌕</span>
        <input
          id="people-search"
          type="search"
          placeholder="Search by name…"
          aria-label="Search people by display name"
          autoComplete="off"
          onChange={(event) => setTerm(event.target.value)}
          value={term}
        />
        {term && <button type="button" className="clearSearch" aria-label="Clear search" onClick={() => setTerm("")}>×</button>}
      </div>
      {searching && <p className="searchStatus" role="status">Looking for people…</p>}
      {!searching && err && <p className="searchStatus" role="status">{err}</p>}
      {users.length > 0 && (
        <div className="searchResults" aria-label="Search results">
          {users.map((user) => (
            <button type="button" className="userChat searchResult" key={user.uid} onClick={() => handleSelect(user)} disabled={Boolean(selectingUid)}>
              <img src={user.photoURL || undefined} alt="" />
              <span className="userChatInfo">
                <span className="personName">{user.displayName || "Third Wheel member"}</span>
                <span className="personHint">View profile and say hello</span>
              </span>
              {selectingUid === user.uid ? <span className="openingLabel" role="status">Opening…</span> : <span className="resultArrow" aria-hidden="true">↗</span>}
            </button>
          ))}
        </div>
      )}
    </section>
  );
};

export default Search;
