import React, { useContext, useState } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  setDoc,
  doc,
  updateDoc,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { AuthContext } from "../context/AuthContext";
import { ChatContext } from "../context/ChatContext";

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
      const match = querySnapshot.docs
        .map((userDoc) => userDoc.data())
        .find((result) => result.uid !== currentUser?.uid);

      if (!match) {
        setErr("No other user found with that display name.");
        return;
      }

      setUser(match);
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
    const combinedId =
      currentUser.uid > selectedUser.uid
        ? currentUser.uid + selectedUser.uid
        : selectedUser.uid + currentUser.uid;

    try {
      const chatRef = doc(db, "chats", combinedId);
      const chatSnapshot = await getDoc(chatRef);

      if (!chatSnapshot.exists()) {
        await setDoc(chatRef, { messages: [] });

        await Promise.all([
          updateDoc(doc(db, "userChats", currentUser.uid), {
            [combinedId + ".userInfo"]: {
              uid: selectedUser.uid,
              displayName: selectedUser.displayName,
              photoURL: selectedUser.photoURL,
            },
            [combinedId + ".date"]: serverTimestamp(),
          }),
          updateDoc(doc(db, "userChats", selectedUser.uid), {
            [combinedId + ".userInfo"]: {
              uid: currentUser.uid,
              displayName: currentUser.displayName,
              photoURL: currentUser.photoURL,
            },
            [combinedId + ".date"]: serverTimestamp(),
          }),
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
