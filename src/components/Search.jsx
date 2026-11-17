import React, { useContext, useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { AuthContext } from "../context/AuthContext";
import { ChatContext } from "../context/ChatContext";
import { getChatId } from "../utils/chat";

const Search = () => {
  const [username, setUsername] = useState("");
  const [users, setUsers] = useState([]);
  const [err, setErr] = useState("");
  const [searching, setSearching] = useState(false);
  const [selectingUid, setSelectingUid] = useState(null);

  const { currentUser } = useContext(AuthContext);
  const { dispatch } = useContext(ChatContext);

  useEffect(() => {
    const searchTerm = username.trim().toLowerCase();
    let active = true;

    setUsers([]);
    setErr("");

    if (!searchTerm || !currentUser?.uid) {
      setSearching(false);
      return undefined;
    }

    const timeoutId = setTimeout(async () => {
      setSearching(true);
      try {
        const usersQuery = query(
          collection(db, "publicProfiles"),
          where("displayNameLower", ">=", searchTerm),
          where("displayNameLower", "<=", searchTerm + "\uf8ff"),
          orderBy("displayNameLower"),
          limit(10)
        );
        const snapshot = await getDocs(usersQuery);
        if (!active) return;

        const matches = snapshot.docs
          .map((profileDoc) => profileDoc.data())
          .filter((profile) => profile.uid !== currentUser.uid);

        setUsers(matches);
        if (matches.length === 0) setErr("No users found. Try another name.");
      } catch (error) {
        console.error("User search failed:", error);
        if (active) setErr("Search failed. Please try again.");
      } finally {
        if (active) setSearching(false);
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [username, currentUser?.uid]);

  const handleSelect = async (selectedUser) => {
    if (!currentUser?.uid || !selectedUser?.uid || selectingUid) return;

    setSelectingUid(selectedUser.uid);
    setErr("");
    const chatId = getChatId(currentUser.uid, selectedUser.uid);

    try {
      const chatRef = doc(db, "chats", chatId);
      const participants = [currentUser.uid, selectedUser.uid].sort();

      // A transaction prevents two users opening the same new chat from overwriting it.
      await runTransaction(db, async (transaction) => {
        const chatSnapshot = await transaction.get(chatRef);
        if (!chatSnapshot.exists()) {
          transaction.set(chatRef, { participants, messages: [] });
          return;
        }

        const existingParticipants = chatSnapshot.data().participants || [];
        if (
          existingParticipants.length !== 2 ||
          !participants.every((uid) => existingParticipants.includes(uid))
        ) {
          throw new Error("Conversation participants do not match.");
        }
      });

      // Repair either missing chat-list entry without replacing existing history.
      const currentEntryRef = doc(db, "users", currentUser.uid, "userChats", chatId);
      const otherEntryRef = doc(db, "users", selectedUser.uid, "userChats", chatId);
      const [currentEntry, otherEntry] = await Promise.all([
        getDoc(currentEntryRef),
        getDoc(otherEntryRef),
      ]);

      const currentUserInfo = {
        uid: currentUser.uid,
        displayName: currentUser.displayName || "",
        photoURL: currentUser.photoURL || "",
      };
      const selectedUserInfo = {
        uid: selectedUser.uid,
        displayName: selectedUser.displayName || "",
        photoURL: selectedUser.photoURL || "",
      };

      const repairs = [];
      if (!currentEntry.exists()) {
        repairs.push(setDoc(currentEntryRef, {
          userInfo: selectedUserInfo,
          date: serverTimestamp(),
        }));
      }
      if (!otherEntry.exists()) {
        repairs.push(setDoc(otherEntryRef, {
          userInfo: currentUserInfo,
          date: serverTimestamp(),
        }));
      }
      await Promise.all(repairs);

      dispatch({ type: "CHANGE_USER", payload: selectedUser });
      setUsers([]);
      setUsername("");
    } catch (error) {
      console.error("Unable to open conversation:", error);
      setErr("Could not open this conversation. Please try again.");
    } finally {
      setSelectingUid(null);
    }
  };

  return (
    <div className="search">
      <div className="searchForm">
        <input
          type="text"
          placeholder="Find a user"
          aria-label="Find a user"
          autoComplete="off"
          onChange={(event) => setUsername(event.target.value)}
          value={username}
        />
      </div>
      {searching && <span role="status">Searching...</span>}
      {err && !searching && <span role="status">{err}</span>}
      {users.map((user) => (
        <div
          className="userChat"
          key={user.uid}
          onClick={() => handleSelect(user)}
          role="button"
          tabIndex={0}
          aria-disabled={Boolean(selectingUid)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              handleSelect(user);
            }
          }}
        >
          <img src={user.photoURL} alt="" />
          <div className="userChatInfo"><span>{user.displayName}</span></div>
          {selectingUid === user.uid && <span>Opening...</span>}
        </div>
      ))}
    </div>
  );
};

export default Search;
