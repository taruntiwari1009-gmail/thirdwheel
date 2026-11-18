import React, { useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { listBlockedUsers, setBlocked } from "../services/backend";

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
      if (!currentUser?.uid) { setLoading(false); return; }
      setLoading(true); setError("");
      try {
        const entries = await listBlockedUsers(currentUser.uid);
        if (active) setBlockedUsers(entries);
      } catch (loadError) {
        console.error("Unable to load blocked accounts:", loadError);
        if (active) setError("We couldn't load your blocked accounts. Please try again.");
      } finally { if (active) setLoading(false); }
    };
    load();
    return () => { active = false; };
  }, [currentUser?.uid]);

  const unblock = async user => {
    if (!currentUser?.uid || busyUid) return;
    setBusyUid(user.uid); setError(""); setNotice("");
    try {
      await setBlocked(currentUser.uid, user.uid, true);
      setBlockedUsers(previous => previous.filter(entry => entry.uid !== user.uid));
      setNotice(`${user.displayName} has been unblocked. You can block them again at any time.`);
    } catch (unblockError) {
      console.error("Unable to unblock account:", unblockError);
      setError("We couldn't unblock this account. Please try again.");
    } finally { setBusyUid(""); }
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
