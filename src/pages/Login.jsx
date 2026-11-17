import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";

const Login = () => {
  const [err, setErr] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setErr(false);
    const form = event.currentTarget;
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;

    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate("/", { replace: true });
    } catch (error) {
      console.error("Login failed:", error);
      setErr(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="formContainer">
      <div className="formWrapper">
        <span className="logo">Third Wheel</span>
        <span className="title">Login</span>
        <form onSubmit={handleSubmit}>
          <input required name="email" type="email" placeholder="email" />
          <input required name="password" type="password" placeholder="password" />
          <button disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
          {err && <span role="alert">Unable to sign in. Check your details and try again.</span>}
        </form>
        <p>You don't have an account? <Link to="/register">Register</Link></p>
      </div>
    </div>
  );
};

export default Login;
