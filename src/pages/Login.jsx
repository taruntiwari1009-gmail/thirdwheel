import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";

const Login = () => {
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const handleSubmit = async event => {
    event.preventDefault(); if (loading) return;
    setLoading(true); setErr("");
    const form = event.currentTarget;
    try { await signInWithEmailAndPassword(auth,form.elements.email.value.trim(),form.elements.password.value); navigate("/",{replace:true}); }
    catch(error) { setErr("Unable to sign in. Check your details and try again."); }
    finally { setLoading(false); }
  };
  return <div className="formContainer"><div className="formWrapper">
    <span className="logo">Third Wheel</span><span className="title">Welcome back</span>
    <form onSubmit={handleSubmit}>
      <label>Email<input required name="email" type="email" autoComplete="email" /></label>
      <label>Password<input required name="password" type="password" autoComplete="current-password" /></label>
      <Link to="/forgot-password">Forgot password?</Link>
      <button disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
      {err && <span role="alert">{err}</span>}
    </form><p>New here? <Link to="/register">Create an account</Link></p>
  </div></div>;
};
export default Login;
