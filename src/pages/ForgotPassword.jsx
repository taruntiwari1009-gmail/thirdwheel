import React, { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabase";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async event => {
    event.preventDefault();
    if (!supabase) { setError("The app is not connected to Supabase yet."); return; }
    setLoading(true); setError(""); setStatus("");
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) throw resetError;
      setStatus("If an account exists for that email, a password reset link has been sent.");
    } catch (error) {
      setError("We couldn't send the reset email. Please try again.");
    } finally { setLoading(false); }
  };

  return <main className="authPage"><section className="authCard">
    <p className="eyebrow">THIRD WHEEL</p><h1>Reset your password</h1>
    <p className="muted">We'll email you a secure link to choose a new password.</p>
    <form onSubmit={submit} className="stack">
      <label>Email address<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
      <button disabled={loading || !supabase}>{loading ? "Sending…" : "Send reset link"}</button>
      {status && <p role="status" className="successText">{status}</p>}
      {error && <p role="alert" className="errorText">{error}</p>}
    </form><Link to="/login">Back to sign in</Link>
  </section></main>;
}
