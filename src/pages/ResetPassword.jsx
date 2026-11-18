import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../supabase";

export default function ResetPassword() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    if (!supabase) { setError("The app is not connected to Supabase yet."); return undefined; }
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError || !data.session) setError("This password-reset link is invalid or has expired. Request a new link.");
      else setReady(true);
    });
    return () => { active = false; };
  }, []);

  const submit = async event => {
    event.preventDefault();
    if (!supabase || saving) return;
    if (password.length < 8) { setError("Use at least 8 characters for your new password."); return; }
    if (password !== confirmPassword) { setError("The passwords do not match."); return; }
    setSaving(true); setError("");
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setNotice("Your password has been updated. You can now sign in.");
      await supabase.auth.signOut();
      setTimeout(() => navigate("/login", { replace: true }), 800);
    } catch (updateError) {
      setError("We couldn't update your password. Request a fresh reset link and try again.");
    } finally { setSaving(false); }
  };

  return <main className="authPage authPage--recovery">
    <div className="authLayout">
      <aside className="authStory" aria-label="About Third Wheel">
        <Link className="authStoryBrand" to="/">Third Wheel <span>✳</span></Link>
        <div className="authStoryContent">
          <span className="authStoryEyebrow">SECURE YOUR SPACE</span>
          <h2>Back to the<br />good conversations.</h2>
          <p>Choose a new password and return to your inbox.</p>
          <div className="authStoryOrbit" aria-hidden="true"><span>✳</span><i></i><b></b></div>
        </div>
        <span className="authStoryFoot">Your account, your space.</span>
      </aside>
      <section className="authCard authCard--entry authCard--recovery">
        <p className="eyebrow">PASSWORD RESET</p>
        <h1>Choose a new password.</h1>
        <p className="muted">Use a password you haven’t used for another account.</p>
        <form onSubmit={submit} className="stack">
          <label>New password
            <input type="password" minLength="8" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} required />
          </label>
          <label>Confirm password
            <input type="password" minLength="8" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required />
          </label>
          <button disabled={!ready || saving}>{saving ? "Updating…" : "Update password"}</button>
          {notice && <p role="status" className="successText">{notice}</p>}
          {error && <p role="alert" className="errorText">{error}</p>}
        </form>
        <Link className="authBackLink" to="/login">← Back to sign in</Link>
      </section>
    </div>
  </main>;
}
