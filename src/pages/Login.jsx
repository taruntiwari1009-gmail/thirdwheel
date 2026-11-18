import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../supabase";

const Login = () => {
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async event => {
    event.preventDefault();
    if (loading) return;
    if (!supabase) { setErr("The app is not connected to Supabase yet. Check its environment configuration."); return; }
    setLoading(true);
    setErr("");
    const form = event.currentTarget;
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: form.elements.email.value.trim(),
        password: form.elements.password.value,
      });
      if (error) throw error;
      navigate("/", { replace: true });
    } catch (error) {
      console.error("Sign-in failed:", error);
      setErr("Unable to sign in. Check your email and password, then try again.");
    } finally {
      setLoading(false);
    }
  };

  return <main className="authPage">
    <section className="authCard loginCard">
      <p className="eyebrow">THIRD WHEEL</p>
      <h1>Welcome back</h1>
      <p className="muted">Your conversations are right where you left them.</p>
      <form onSubmit={handleSubmit} className="stack">
        <label>Email address
          <input required name="email" type="email" autoComplete="email" />
        </label>
        <label>Password
          <input required name="password" type="password" autoComplete="current-password" />
        </label>
        <div className="authFormMeta"><Link to="/forgot-password">Forgot password?</Link></div>
        <button type="submit" disabled={loading || !supabase}>{loading ? "Signing in…" : "Sign in"}</button>
        {err && <p role="alert" className="errorText">{err}</p>}
      </form>
      <p className="authFooter">New here? <Link to="/register">Create an account</Link></p>
    </section>
  </main>;
};

export default Login;
