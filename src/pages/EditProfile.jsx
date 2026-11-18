import React, { useContext, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { getProfile, saveProfile } from "../services/backend";
import { isAllowedImage } from "../utils/chat";
import { safeExternalUrl, getProfileInitials } from "../utils/profile";

const fields = [
  ["username","Username","text"],["displayName","Display name","text"],["pronouns","Pronouns (optional)","text"],["bio","A little about you","textarea"],
  ["interests","Interests (comma separated)","list"],["hobbies","Hobbies (comma separated)","list"],
  ["languages","Languages (comma separated)","list"],["education","Course / field of study","text"],
  ["institution","College or university","text"],["graduationYear","Graduation year","text"],
  ["city","City","text"],["connectionGoals","What would you like to connect over? (comma separated)","list"],
  ["website","Website URL","url"],["instagram","Instagram URL","url"],["linkedin","LinkedIn URL","url"]
];
const split = value => value.split(",").map(x => x.trim()).filter(Boolean).slice(0, 20);

export default function EditProfile() {
  const { currentUser, refreshCurrentUser } = useContext(AuthContext);
  const navigate = useNavigate();
  const [form, setForm] = useState({});
  const [avatar, setAvatar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    if (!currentUser?.uid) { setLoading(false); return undefined; }
    getProfile(currentUser.uid).then(profile => {
      if (!alive) return;
      const p = profile || {};
      setForm({
        ...p,
        username: p.username || "",
        displayName: p.displayName || currentUser.displayName || "",
        interests: (p.interests || []).join(", "),
        hobbies: (p.hobbies || []).join(", "),
        languages: (p.languages || []).join(", "),
        connectionGoals: (p.connectionGoals || []).join(", "),
      });
    }).catch(loadError => {
      console.error("Unable to load profile:", loadError);
      if (alive) setError("Unable to load your profile.");
    }).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [currentUser?.uid, currentUser?.displayName]);

  const change = (key, value) => setForm(old => ({ ...old, [key]: value }));
  const save = async event => {
    event.preventDefault();
    if (saving || !currentUser?.uid) return;
    setSaving(true); setError("");
    const displayName = (form.displayName || "").trim();
    const username = (form.username || "").trim().replace(/^@/, "").toLowerCase();
    if (!displayName) { setError("Display name is required."); setSaving(false); return; }
    const externalLinks = ["website", "instagram", "linkedin"];
    if (externalLinks.some(key => (form[key] || "").trim() && !safeExternalUrl(form[key]))) {
      setError("Website and social links must be valid HTTP or HTTPS URLs."); setSaving(false); return;
    }
    if (username && !/^[a-z0-9_.]{3,24}$/.test(username)) {
      setError("Username must be 3–24 characters and use letters, numbers, dots or underscores."); setSaving(false); return;
    }
    if (avatar && !isAllowedImage(avatar)) { setError("Choose an image smaller than 5 MB."); setSaving(false); return; }

    try {
      await saveProfile(currentUser.uid, {
        ...form,
        username,
        displayName,
        interests: split(form.interests || ""),
        hobbies: split(form.hobbies || ""),
        languages: split(form.languages || ""),
        connectionGoals: split(form.connectionGoals || ""),
        website: safeExternalUrl(form.website || ""),
        instagram: safeExternalUrl(form.instagram || ""),
        linkedin: safeExternalUrl(form.linkedin || ""),
      }, avatar);
      await refreshCurrentUser();
      navigate("/profile", { replace: true });
    } catch (saveError) {
      console.error("Profile save failed:", saveError);
      setError(saveError.code === "23505"
        ? "That username is already taken. Please choose another."
        : saveError.message || "Your profile could not be saved. Check your connection and try again.");
    } finally { setSaving(false); }
  };

  if (loading) return <main className="pageShell"><p role="status">Loading editor…</p></main>;
  return <main className="pageShell editPage">
    <header className="pageHeader"><Link to="/profile">← Your profile</Link><p className="eyebrow">MAKE IT YOURS</p></header>
    <h1>Edit your profile</h1><p className="muted">Share as much or as little as you like. Only your display name is required.</p>
    <form className="profileForm profileEditForm" onSubmit={save}>
      <section className="profilePreview profilePreviewCard" aria-label="Live profile preview">
        <p className="eyebrow">PREVIEW</p>
        <div className="profilePreviewIdentity">
          {form.photoURL && !avatar ? <img src={form.photoURL} alt="" /> : <span className="profilePreviewAvatar" aria-hidden="true">{getProfileInitials(form.displayName || currentUser?.displayName)}</span>}
          <div>
            <h2>{(form.displayName || "").trim() || "Your display name"}</h2>
            {form.username && <p>@{form.username.replace(/^@/, "")}</p>}
            {form.pronouns && <p>{form.pronouns}</p>}
          </div>
        </div>
        <p className="profilePreviewBio">{(form.bio || "").trim() || "Your short introduction will appear here."}</p>
        <div className="profilePreviewTags">
          {split(form.interests || "").slice(0, 4).map(item => <span key={item}>{item}</span>)}
          {!split(form.interests || "").length && <span>Your interests</span>}
        </div>
        <p className="profilePreviewVisibility">{form.discoverable === false ? "Hidden from people search" : "Visible in people search"}</p>
      </section>
      <label>Profile photo<input type="file" accept="image/*" onChange={event => setAvatar(event.target.files?.[0] || null)} /></label>
      <label className="privacyToggle"><input type="checkbox" checked={form.discoverable !== false} onChange={event => change("discoverable", event.target.checked)} /> Show my profile in search results</label>
      {avatar && <p className="muted small">New photo selected: {avatar.name}</p>}
      {fields.map(([key, label, type]) => <label key={key}>{label}
        {type === "textarea"
          ? <textarea rows="4" maxLength="300" value={form[key] || ""} onChange={event => change(key, event.target.value)} />
          : <input type={type === "list" ? "text" : type} maxLength={type === "list" ? 500 : 300} value={form[key] || ""} onChange={event => change(key, event.target.value)} />}
      </label>)}
      <p className="muted small">Usernames are unique and reserved without regard to letter case. People can find you by display name. Turn off search visibility to hide your profile from discovery. Your email and authentication details are never public.</p>
      {error && <p role="alert" className="errorText">{error}</p>}
      <div className="formActions profileFormActions"><Link to="/profile">Cancel</Link><button disabled={saving}>{saving ? "Saving…" : "Save profile"}</button></div>
    </form>
  </main>;
}
