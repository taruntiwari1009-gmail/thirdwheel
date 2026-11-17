import React, { useContext, useState } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  setDoc,
  doc,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { AuthContext } from "../context/AuthContext";
import { ChatContext } from "../context/ChatContext";
import { getChatId } from "../utils/chat";

const Search = () => {
  const [username, setUsername] = useState("");
  const [user, setUser] = useState(null);
  const [err, setErr] = useState("");
  const [selecting, setSelecting] = useState(false);

  const { currentUser } = useContext(AuthContext);
  const { dispatch } = useContext(ChatContext);

  const handleSearch = async () => {
    const searchTerm = username.trim();
    setUser(null);
    setErr("");

    if (!searchTerm) return;

    try {
      const usersQuery = query(
        collection(db, "users"),
        where("displayName", "==", searchTerm)
      );
      const querySnapshot = await getDocs(usersQuery);
      const matches = querySnapshot.docs
        .map((userDoc) => userDoc.data())
        .filter((result) => result.uid !== currentUser?.uid);

      if (matches.length === 0) {
        setErr("No other user found with that display name.");
        return;
      }
      if (matches.length > 1) {
        setErr("More than one user has that display name. Ask for a unique name.");
        return;
      }

      setUser(matches[0]);
    } catch (error) {
      console.error("User search failed:", error);
      setErr("Search failed. Please try again.");
    }
  };

  const handleKey = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSearch();
    }
  };

  const handleSelect = async () => {
    if (!currentUser?.uid || !user?.uid || selecting) return;

    setSelecting(true);
    setErr("");

    const selectedUser = user;
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
      setUser(null);
      setUsername("");
    } catch (error) {
      console.error("Unable to open conversation:", error);
      setErr("Could not open this conversation. Please try again.");
    } finally {
      setSelecting(false);
    }
  };

  return (
    <div className="search">
      <div className="searchForm">
        <input
          type="text"
          placeholder="Find a user"
          onKeyDown={handleKey}
          onChange={(event) => setUsername(event.target.value)}
          value={username}
        />
      </div>
      {err && <span role="alert">{err}</span>}
      {user && (
        <div
          className="userChat"
          onClick={handleSelect}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              handleSelect();
            }
          }}
        >
          <img src={user.photoURL} alt="" />
          <div className="userChatInfo">
            <span>{user.displayName}</span>
          </div>
          {selecting && <span>Opening...</span>}
        </div>
      )}
    </div>
  );
};

export default Search;
