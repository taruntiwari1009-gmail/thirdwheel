import React, { useContext, useEffect, useState } from "react";
import { getIdTokenResult, signOut } from "firebase/auth";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import { AuthContext } from "../context/AuthContext";

const Navbar = () => {
  const { currentUser } = useContext(AuthContext);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [isModerator,setIsModerator] = useState(false);
  useEffect(() => { let active = true; if (!currentUser) { setIsModerator(false); return undefined; } getIdTokenResult(currentUser).then(result => { if (active) setIsModerator(result.claims.moderator === true); }).catch(() => active && setIsModerator(false)); return () => { active = false; }; }, [currentUser]);
  const navigate = useNavigate();
  const logout = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try { await signOut(auth); navigate("/login",{replace:true}); }
    catch(e) { setError("Couldn't sign out. Please try again."); setBusy(false); }
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
