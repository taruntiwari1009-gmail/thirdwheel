import React, { useContext, useState } from "react";
import { signOut } from "firebase/auth";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import { AuthContext } from "../context/AuthContext";

const Navbar = () => {
  const { currentUser } = useContext(AuthContext);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const navigate = useNavigate();
  const logout = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try { await signOut(auth); navigate("/login",{replace:true}); }
    catch(e) { setError("Couldn't sign out. Please try again."); setBusy(false); }
  };
  return <div className="navbar">
    <Link className="logo" to="/">Third Wheel</Link>
    <div className="user">
      <Link to="/profile" className="navProfile"><img src={currentUser?.photoURL || ""} alt="" /><span>{currentUser?.displayName || "Your profile"}</span></Link>
      <button type="button" onClick={logout} disabled={busy}>{busy ? "Signing out…" : "Sign out"}</button>
    </div>
    {error && <span role="alert" className="navError">{error}</span>}
  </div>;
};
export default Navbar;
