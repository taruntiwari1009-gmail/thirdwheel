import React, { useContext, useEffect, useState } from "react";
import { doc, getDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { Link, useParams } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { db } from "../firebase";
import { safeExternalUrl } from "../utils/profile";

const EMPTY = {
  username: "", displayName: "", pronouns: "", bio: "", interests: [], hobbies: [],
  languages: [], education: "", institution: "", graduationYear: "", city: "",
  connectionGoals: [], website: "", instagram: "", linkedin: ""
};
const list = value => Array.isArray(value) ? value : [];

export default function Profile() {
  const { uid } = useParams();
  const { currentUser } = useContext(AuthContext);
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
  const [deletionStatus, setDeletionStatus] = useState("");

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
      if (owner && currentUser?.uid) {
        const deletionRequest = await getDoc(doc(db, "accountDeletionRequests", currentUser.uid));
        if (active && deletionRequest.exists()) setDeletionStatus(deletionRequest.data().status || "");
      }
      if (!owner && currentUser?.uid) {
        const block = await getDoc(doc(db, "users", currentUser.uid, "blockedUsers", id));
        if (active) setBlocked(block.exists());
      }
      if (active) setLoading(false);
    };
    load().catch(loadError => {
      if (!active) return;
      console.error("Unable to load profile:", loadError);
      setProfile(EMPTY);
      setError(loadError.code === "permission-denied" || loadError.code === "not-found"
        ? "This profile isn't available. It may be private or no longer discoverable."
        : loadError.code === "unavailable" || loadError.code === "deadline-exceeded"
          ? "This profile couldn't be loaded because of a connection issue. Please try again."
          : "We couldn't load this profile. Please try again.");
    }).finally(() => active && setLoading(false));
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
      const batch = writeBatch(db);
      const blockRef = doc(db, "users", currentUser.uid, "blockedUsers", id);
      const reverseBlockRef = doc(db, "users", id, "blockedBy", currentUser.uid);
      if (blocked) {
        batch.delete(blockRef);
        batch.delete(reverseBlockRef);
        await batch.commit();
        setBlocked(false);
        setNotice("This person has been unblocked.");
      } else {
        batch.set(blockRef, { createdAt: serverTimestamp() });
        batch.set(reverseBlockRef, { createdAt: serverTimestamp() });
        const inboxRef = doc(db, "users", currentUser.uid, "userChats", [currentUser.uid, id].sort().join(""));
        const inboxEntry = await getDoc(inboxRef);
        if (inboxEntry.exists()) batch.delete(inboxRef);
        await batch.commit();
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

  const requestDeletion = async () => {
    if (!currentUser?.uid || !owner || actionBusy || deletionStatus === "pending_review" || deletionStatus === "approved" || deletionStatus === "processing" || deletionStatus === "completed") return;
    const confirmed = window.confirm("Request deletion of your Third Wheel account? An owner must review the request before deletion begins. If approved, your profile and account will be removed, while shared conversations remain for the other participant and show “Deleted account.”");
    if (!confirmed) return;
    setActionBusy(true);
    setError("");
    try {
      const request = httpsCallable(getFunctions(), "requestAccountDeletion");
      const result = await request();
      setDeletionStatus(result.data.status || "pending_review");
      setNotice("Your account deletion request has been submitted for review. Your account remains active until an owner approves and processes it.");
    } catch (requestError) {
      console.error("Unable to request account deletion:", requestError);
      setError("Your deletion request couldn't be submitted. Please try again.");
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
      const submitReport = httpsCallable(getFunctions(), "submitReport");
      await submitReport({ targetUid: id, reason, details: details.trim().slice(0, 500) });
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
      {profile.photoURL ? <img className="profileAvatar" src={profile.photoURL} alt="" /> : <span className="profileAvatar profileAvatarFallback" aria-hidden="true">{(profile.displayName || "T").trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()}</span>}
      <div>
        <p className="eyebrow">COMMUNITY PROFILE</p>
        <h1>{profile.displayName || "New member"}</h1>
        {profile.username && <p className="muted">@{profile.username}</p>}
        {profile.pronouns && <p className="muted">{profile.pronouns}</p>}
        <p className="muted">{profile.city || "Location not added"}</p>
      </div>
    </section>
    {!owner && <section className="profileActions" aria-label="Profile safety controls">
      <button type="button" className="secondaryAction" onClick={toggleBlock} disabled={actionBusy}>{actionBusy ? "Please wait…" : blocked ? "Unblock person" : "Block person"}</button>
      <button type="button" className="textAction" onClick={() => setReportOpen(value => !value)}>Report profile</button>
    </section>}
    {reportOpen && <form className="reportForm" onSubmit={submitReport}>
      <h2>Report this profile</h2>
      <label>What's the issue?
        <select value={reason} onChange={event => setReason(event.target.value)}>
          <option value="spam">Spam</option>
          <option value="scam">Scam or fraud</option>
          <option value="harassment">Harassment or bullying</option>
          <option value="threats">Threats or intimidation</option>
          <option value="stalking">Stalking or unwanted contact</option>
          <option value="sexual_harassment">Sexual harassment</option>
          <option value="underage">Suspected underage account</option>
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
    {owner && <section className="profileSection accountDangerZone">
      <h2>Account controls</h2>
      <p className="muted">Request permanent account deletion. This requires review before it begins. Shared conversations and messages will be retained for the other participant.</p>
      {deletionStatus && <p className="muted small" role="status">Deletion request status: {deletionStatus.replaceAll("_", " ")}</p>}
      <button type="button" className="secondaryAction" onClick={requestDeletion} disabled={actionBusy || ["pending_review", "approved", "processing", "completed"].includes(deletionStatus)}>
        {actionBusy ? "Submitting…" : deletionStatus === "completed" ? "Account deleted" : deletionStatus ? "Deletion request submitted" : "Request account deletion"}
      </button>
    </section>}
    {notice && <p className="successText" role="status">{notice}</p>}
    {error && <p className="errorText" role="alert">{error}</p>}
    {profile.bio && <section className="profileSection"><h2>About</h2><p>{profile.bio}</p></section>}
    <section className="profileGrid">
      {[["Interests", profile.interests], ["Hobbies", profile.hobbies], ["Languages", profile.languages], ["Education", [profile.education, profile.institution, profile.graduationYear]], ["Connect over", profile.connectionGoals]].map(([title, values]) => {
        const items = list(values).filter(Boolean);
        return <div className="profileSection" key={title}><h2>{title}</h2>{items.length ? <div className="profileTags">{items.map(item => <span className="profileTag" key={item}>{item}</span>)}</div> : <p className="muted small">Not added yet</p>}</div>;
      })}
    </section>
    <section className="profileSection"><h2>Elsewhere</h2><div className="linkRow">
      {safeExternalUrl(profile.website) && <a href={safeExternalUrl(profile.website)} target="_blank" rel="noopener noreferrer">Website</a>}
      {safeExternalUrl(profile.instagram) && <a href={safeExternalUrl(profile.instagram)} target="_blank" rel="noopener noreferrer">Instagram</a>}
      {safeExternalUrl(profile.linkedin) && <a href={safeExternalUrl(profile.linkedin)} target="_blank" rel="noopener noreferrer">LinkedIn</a>}
      {!safeExternalUrl(profile.website) && !safeExternalUrl(profile.instagram) && !safeExternalUrl(profile.linkedin) && <span className="muted">No links added</span>}
    </div></section>
  </main>;
}
