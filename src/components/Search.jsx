import React, { useContext, useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
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

    // Debounce requests so each keystroke does not trigger a Firestore read.
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
        if (matches.length === 0) {
          setErr("No users found. Try another name.");
        }
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

    const combinedId = getChatId(currentUser.uid, selectedUser.uid);

    try {
      const chatRef = doc(db, "chats", combinedId);
      const chatSnapshot = await getDoc(chatRef);

      if (!chatSnapshot.exists()) {
        await setDoc(chatRef, {
          participants: [currentUser.uid, selectedUser.uid].sort(),
          messages: [],
        });

        const chatListEntryForCurrentUser = {
          userInfo: {
            uid: selectedUser.uid,
            displayName: selectedUser.displayName,
            photoURL: selectedUser.photoURL,
          },
          date: serverTimestamp(),
        };
        const chatListEntryForSelectedUser = {
          userInfo: {
            uid: currentUser.uid,
            displayName: currentUser.displayName,
            photoURL: currentUser.photoURL || "",
          },
          date: serverTimestamp(),
        };

        await Promise.all([
          setDoc(doc(db, "users", currentUser.uid, "userChats", combinedId), chatListEntryForCurrentUser),
          setDoc(doc(db, "users", selectedUser.uid, "userChats", combinedId), chatListEntryForSelectedUser),
        ]);
      }

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
          <div className="userChatInfo">
            <span>{user.displayName}</span>
          </div>
          {selectingUid === user.uid && <span>Opening...</span>}
        </div>
      ))}
    </div>
  );
};

export default Search;
