import React, { useContext, useState } from "react";
import { Link } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { supabase } from "../supabase";

const EMPTY_PASSWORDS = { current: "", next: "", confirm: "" };

export default function AccountSettings() {
  const { currentUser } = useContext(AuthContext);
  const [passwords, setPasswords] = useState(EMPTY_PASSWORDS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const changePassword = async event => {
    event.preventDefault();
    if (saving) return;
    setError("");
    setNotice("");

    if (!supabase || !currentUser?.email) {
      setError("Account security is temporarily unavailable. Refresh the page and try again.");
      return;
    }
    if (!passwords.current) {
      setError("Enter your current password to continue.");
      return;
    }
    if (passwords.next.length < 8) {
      setError("Your new password must be at least 8 characters long.");
      return;
    }
    if (passwords.next !== passwords.confirm) {
      setError("The new password and confirmation do not match.");
      return;
    }
    if (passwords.next === passwords.current) {
      setError("Choose a password that is different from your current one.");
      return;
    }

    setSaving(true);
    try {
      const { error: verificationError } = await supabase.auth.signInWithPassword({
        email: currentUser.email,
        password: passwords.current,
      });
      if (verificationError) {
        setError("Your current password is incorrect. Check it and try again.");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: passwords.next });
      if (updateError) throw updateError;
      setPasswords(EMPTY_PASSWORDS);
      setNotice("Your password has been updated.");
    } catch (updateError) {
      console.error("Password update failed:", updateError);
      setError(updateError.message || "Your password could not be updated. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return <main className="pageShell accountSettingsPage">
    <header className="pageHeader accountSettingsHeader">
      <Link to="/" className="textLink">← Third Wheel</Link>
      <span className="eyebrow">ACCOUNT SETTINGS</span>
    </header>

    <div className="pageIntro accountSettingsIntro">
      <h1>Your account.</h1>
      <p className="muted">Manage sign-in security, profile privacy and account controls in one place.</p>
    </div>

    <section className="accountSettingsCard">
      <div className="accountSettingsCardHeading">
        <span className="eyebrow">SIGN-IN & SECURITY</span>
        <h2>Change your password</h2>
        <p className="muted small">Confirm your current password before choosing a new one.</p>
      </div>
      <div className="accountEmailRow">
        <span>Email address</span>
        <strong>{currentUser?.email || "Not available"}</strong>
        <small>Your email is private and is not shown on your public profile.</small>
      </div>
      <form className="accountPasswordForm" onSubmit={changePassword}>
        <label>Current password
          <input type="password" autoComplete="current-password" value={passwords.current}
            onChange={event => setPasswords(previous => ({ ...previous, current: event.target.value }))} required />
        </label>
        <label>New password
          <input type="password" autoComplete="new-password" minLength="8" value={passwords.next}
            onChange={event => setPasswords(previous => ({ ...previous, next: event.target.value }))} required />
        </label>
        <label>Confirm new password
          <input type="password" autoComplete="new-password" minLength="8" value={passwords.confirm}
            onChange={event => setPasswords(previous => ({ ...previous, confirm: event.target.value }))} required />
        </label>
        {error && <p role="alert" className="errorText">{error}</p>}
        {notice && <p role="status" className="successText">{notice}</p>}
        <div className="formActions accountPasswordActions">
          <button type="submit" disabled={saving || !supabase}>{saving ? "Updating…" : "Update password"}</button>
        </div>
      </form>
    </section>

    <section className="accountSettingsCard accountSettingsLinks">
      <div className="accountSettingsCardHeading">
        <span className="eyebrow">PRIVACY & CONTROL</span>
        <h2>Manage your account</h2>
        <p className="muted small">These controls affect your profile and how people can find or contact you.</p>
      </div>
      <Link to="/profile/edit" className="accountSettingsLink">
        <span><strong>Profile & discoverability</strong><small>Edit your details, username, avatar and search visibility</small></span>
        <span aria-hidden="true">→</span>
      </Link>
      <Link to="/settings/blocked" className="accountSettingsLink">
        <span><strong>Blocked accounts</strong><small>Review or unblock people you have blocked</small></span>
        <span aria-hidden="true">→</span>
      </Link>
      <Link to="/profile#account-controls" className="accountSettingsLink">
        <span><strong>Account deletion</strong><small>Review or submit a request for permanent account deletion</small></span>
        <span aria-hidden="true">→</span>
      </Link>
    </section>
  </main>;
}
