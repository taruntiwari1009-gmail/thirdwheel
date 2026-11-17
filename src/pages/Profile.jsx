import React, { useContext, useEffect, useState } from "react";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, addDoc, collection } from "firebase/firestore";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { db } from "../firebase";

const EMPTY = {
  username: "", displayName: "", pronouns: "", bio: "", interests: [], hobbies: [],
  languages: [], education: "", institution: "", graduationYear: "", city: "",
  connectionGoals: [], website: "", instagram: "", linkedin: ""
};
const list = value => Array.isArray(value) ? value : [];

export default function Profile() {
  const { uid } = useParams();
  const { currentUser } = useContext(AuthContext);
  const navigate = useNavigate();
  const id = uid || currentUser?.uid;
  const owner = currentUser?.uid === id;
  const [profile, setProfile] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState("spam");
  const [details, setDetails] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    if (!id) return undefined;
    setLoading(true);
    setError("");
    setNotice("");
    const load = async () => {
      const snapshot = await getDoc(doc(db, "publicProfiles", id));
      if (!active) return;
      if (!snapshot.exists()) {
        setError("This profile isn't available.");
        setLoading(false);
        return;
      }
      setProfile({ ...EMPTY, ...snapshot.data() });
      if (!owner && currentUser?.uid) {
        const block = await getDoc(doc(db, "users", currentUser.uid, "blockedUsers", id));
        if (active) setBlocked(block.exists());
      }
      if (active) setLoading(false);
    };
    load().catch(() => active && setError("We couldn't load this profile."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id, owner, currentUser?.uid]);

  const toggleBlock = async () => {
    if (!currentUser?.uid || !id || owner || actionBusy) return;
    const confirmed = window.confirm(blocked
      ? "Unblock this person? They may be able to contact you again."
      : "Block this person? You won't be able to exchange messages with them.");
    if (!confirmed) return;
    setActionBusy(true);
    setError("");
    try {
      const blockRef = doc(db, "users", currentUser.uid, "blockedUsers", id);
      if (blocked) {
        await deleteDoc(blockRef);
        setBlocked(false);
        setNotice("This person has been unblocked.");
      } else {
        await setDoc(blockRef, { createdAt: serverTimestamp() });
        await deleteDoc(doc(db, "users", currentUser.uid, "userChats", [currentUser.uid, id].sort().join("")));
        setBlocked(true);
        setNotice("This person is blocked. New messages between you are disabled.");
      }
    } catch (actionError) {
      console.error("Unable to update block settings:", actionError);
      setError("This action couldn't be completed. Please try again.");
    } finally {
      setActionBusy(false);
    }
  };

  const submitReport = async event => {
    event.preventDefault();
    if (!currentUser?.uid || !id || owner || actionBusy) return;
    setActionBusy(true);
    setError("");
    try {
      await addDoc(collection(db, "reports"), {
        reporterId: currentUser.uid,
        targetUid: id,
        reason,
        ...(details.trim() ? { details: details.trim().slice(0, 500) } : {}),
        createdAt: serverTimestamp()
      });
      setReportOpen(false);
      setDetails("");
      setNotice("Thank you. Your report has been submitted for review.");
    } catch (reportError) {
      console.error("Unable to submit report:", reportError);
      setError("Your report couldn't be submitted. Please try again.");
    } finally {
      setActionBusy(false);
    }
  };

  if (loading) return <main className="pageShell"><p role="status">Loading profile…</p></main>;
  if (error && !profile.displayName) return <main className="pageShell"><p role="alert">{error}</p><Link to="/">Back to conversations</Link></main>;

  return <main className="pageShell profilePage">
    <header className="pageHeader">
      <Link to="/" className="textLink">← Third Wheel</Link>
      {owner && <Link className="primaryLink" to="/profile/edit">Edit profile</Link>}
    </header>
    <section className="profileHero">
      {profile.photoURL ? <img className="profileAvatar" src={profile.photoURL} alt="" /> : <span className="profileAvatar profileAvatarFallback" aria-hidden="true">{(profile.displayName || "T").trim().split(/\\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()}</span>}
      <div>
        <p className="eyebrow">COMMUNITY PROFILE</p>
        <h1>{profile.displayName || "New member"}</h1>
        {profile.username && <p className="muted">@{profile.username}</p>}
        {profile.pronouns && <p className="muted">{profile.pronouns}</p>}
        <p className="muted">{profile.city || "Location not added"}</p>
      </div>
    </section>
    {!owner && <section className="profileActions" aria-label="Profile safety controls">
      <button type="button" className="secondaryAction" onClick={toggleBlock} disabled={actionBusy || blocked && false}>{actionBusy ? "Please wait…" : blocked ? "Unblock person" : "Block person"}</button>
      <button type="button" className="textAction" onClick={() => setReportOpen(value => !value)}>Report profile</button>
    </section>}
    {reportOpen && <form className="reportForm" onSubmit={submitReport}>
      <h2>Report this profile</h2>
      <label>What's the issue?
        <select value={reason} onChange={event => setReason(event.target.value)}>
          <option value="spam">Spam or scam</option>
          <option value="harassment">Harassment or bullying</option>
          <option value="inappropriate">Inappropriate content</option>
          <option value="impersonation">Impersonation</option>
          <option value="other">Something else</option>
        </select>
      </label>
      <label>Additional details (optional)
        <textarea rows="3" maxLength="500" value={details} onChange={event => setDetails(event.target.value)} placeholder="Share context that may help us review this report." />
      </label>
      <div className="formActions"><button type="button" className="secondaryAction" onClick={() => setReportOpen(false)}>Cancel</button><button type="submit" disabled={actionBusy}>{actionBusy ? "Submitting…" : "Submit report"}</button></div>
    </form>}
    {notice && <p className="successText" role="status">{notice}</p>}
    {error && <p className="errorText" role="alert">{error}</p>}
    {profile.bio && <section className="profileSection"><h2>About</h2><p>{profile.bio}</p></section>}
    <section className="profileGrid">
      {[["Interests", profile.interests], ["Hobbies", profile.hobbies], ["Languages", profile.languages], ["Education", [profile.education, profile.institution, profile.graduationYear]], ["Connect over", profile.connectionGoals]].map(([title, values]) =>
        <div className="profileSection" key={title}><h2>{title}</h2><p>{list(values).filter(Boolean).join(" · ") || "Not added yet"}</p></div>
      )}
    </section>
    <section className="profileSection"><h2>Elsewhere</h2><div className="linkRow">
      {profile.website && <a href={profile.website} target="_blank" rel="noreferrer">Website</a>}
      {profile.instagram && <a href={profile.instagram} target="_blank" rel="noreferrer">Instagram</a>}
      {profile.linkedin && <a href={profile.linkedin} target="_blank" rel="noreferrer">LinkedIn</a>}
      {!profile.website && !profile.instagram && !profile.linkedin && <span className="muted">No links added</span>}
    </div></section>
  </main>;
}
