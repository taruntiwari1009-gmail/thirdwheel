import React, { useContext, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../supabase";
import { AuthContext } from "../context/AuthContext";

const Navbar = () => {
  const { currentUser } = useContext(AuthContext);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isModerator = currentUser?.appMetadata?.moderator === true || currentUser?.appMetadata?.owner === true;
  const navigate = useNavigate();

  const logout = async () => {
    if (busy || !supabase) return;
    setBusy(true); setError("");
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Sign-out failed:", error);
      setError("Couldn't sign out. Please try again.");
    } finally { setBusy(false); }
  };

  const initials = (currentUser?.displayName || "Y").trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  return <div className="navbar">
    <Link className="logo" to="/">Third Wheel</Link>
    <div className="user">
      <Link to="/settings/blocked" className="navSettings">Blocked accounts</Link>
      {isModerator && <Link to="/moderation" className="navSettings">Moderation</Link>}
      <Link to="/profile" className="navProfile">{currentUser?.photoURL ? <img src={currentUser.photoURL} alt="" /> : <span className="avatarFallback" aria-hidden="true">{initials}</span>}<span>{currentUser?.displayName || "Your profile"}</span></Link>
      <button type="button" onClick={logout} disabled={busy}>{busy ? "Signing out…" : "Sign out"}</button>
    </div>
    {error && <span role="alert" className="navError">{error}</span>}
  </div>;
};
export default Navbar;
