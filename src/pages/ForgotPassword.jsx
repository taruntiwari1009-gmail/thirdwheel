import React, { useState } from "react";
import { Link } from "react-router-dom";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../firebase";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true); setError(""); setStatus("");
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setStatus("If an account exists for that email, a password reset link has been sent.");
    } catch (e) {
      setError(e.code === "auth/invalid-email" ? "Enter a valid email address." : "We couldn't send the reset email. Please try again.");
    } finally { setLoading(false); }
  };

  return <main className="authPage"><section className="authCard">
    <p className="eyebrow">THIRD WHEEL</p><h1>Reset your password</h1>
    <p className="muted">We'll email you a secure link to choose a new password.</p>
    <form onSubmit={submit} className="stack">
      <label>Email address<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
      <button disabled={loading}>{loading ? "Sending…" : "Send reset link"}</button>
      {status && <p role="status" className="successText">{status}</p>}
      {error && <p role="alert" className="errorText">{error}</p>}
    </form><Link to="/login">Back to sign in</Link>
  </section></main>;
}
