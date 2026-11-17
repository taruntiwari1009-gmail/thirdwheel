import React, { useContext, useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, writeBatch } from "firebase/firestore";
import { Link } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { db } from "../firebase";

export default function BlockedUsers() {
  const { currentUser } = useContext(AuthContext);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyUid, setBusyUid] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!currentUser?.uid) return;
      setLoading(true);
      setError("");
      try {
        const snapshot = await getDocs(collection(db, "users", currentUser.uid, "blockedUsers"));
        const entries = await Promise.all(snapshot.docs.map(async entry => {
          const profile = await getDoc(doc(db, "publicProfiles", entry.id));
          return {
            uid: entry.id,
            displayName: profile.exists() ? profile.data().displayName || "Unavailable profile" : "Unavailable profile",
            photoURL: profile.exists() ? profile.data().photoURL || "" : ""
          };
        }));
        if (active) setBlockedUsers(entries);
      } catch (loadError) {
        if (active) setError("We couldn't load your blocked accounts. Please try again.");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [currentUser?.uid]);

  const unblock = async user => {
    if (!currentUser?.uid || busyUid) return;
    setBusyUid(user.uid);
    setError("");
    setNotice("");
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, "users", currentUser.uid, "blockedUsers", user.uid));
      batch.delete(doc(db, "users", user.uid, "blockedBy", currentUser.uid));
      await batch.commit();
      setBlockedUsers(previous => previous.filter(entry => entry.uid !== user.uid));
      setNotice(`${user.displayName} has been unblocked. You can block them again at any time.`);
    } catch (unblockError) {
      setError("We couldn't unblock this account. Please try again.");
    } finally {
      setBusyUid("");
    }
  };

  return <main className="pageShell blockedUsersPage">
    <header className="pageHeader">
      <Link to="/" className="textLink">← Third Wheel</Link>
      <h1>Blocked accounts</h1>
      <p className="muted">People you block can't exchange new messages with you. Blocking also removes their conversation from your inbox.</p>
    </header>
    {notice && <p className="successText" role="status">{notice}</p>}
    {error && <p className="errorText" role="alert">{error}</p>}
    {loading ? <p role="status">Loading blocked accounts…</p> : blockedUsers.length === 0
      ? <section className="emptyState"><h2>Your block list is clear</h2><p className="muted">Accounts you block will appear here, and you can unblock them whenever you choose.</p></section>
      : <section className="blockedList" aria-label="Blocked accounts">
        {blockedUsers.map(user => <article className="blockedUser" key={user.uid}>
          {user.photoURL ? <img src={user.photoURL} alt="" /> : <span className="blockedAvatar" aria-hidden="true">{user.displayName.slice(0, 1).toUpperCase()}</span>}
          <div className="blockedUserInfo"><strong>{user.displayName}</strong><span className="muted small">Blocked account</span></div>
          <button type="button" className="secondaryAction" onClick={() => unblock(user)} disabled={Boolean(busyUid)}>{busyUid === user.uid ? "Unblocking…" : "Unblock"}</button>
        </article>)}
      </section>}
  </main>;
}
