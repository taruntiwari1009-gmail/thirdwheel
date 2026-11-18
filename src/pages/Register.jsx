import React, { useState } from "react";
import Add from "../img/addAvatar.png";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../supabase";
import { isAllowedImage } from "../utils/chat";
import { saveProfile } from "../services/backend";

const split = value => value.split(",").map(x => x.trim()).filter(Boolean).slice(0, 20);

const Register = () => {
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmationRequired, setConfirmationRequired] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async event => {
    event.preventDefault();
    if (loading) return;
    if (!supabase) { setErr("The app is not connected to Supabase yet. Check its environment configuration."); return; }
    setLoading(true);
    setErr("");
    const form = event.currentTarget;
    const displayName = form.elements.displayName.value.trim();
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    const file = form.elements.avatar.files[0];
    if (!displayName) { setErr("Enter a display name."); setLoading(false); return; }
    if (file && !isAllowedImage(file)) { setErr("Choose an image smaller than 5 MB, or leave the avatar blank."); setLoading(false); return; }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: {
          display_name: displayName,
          bio: (form.elements.bio?.value || "").trim().slice(0, 300),
          interests: split(form.elements.interests?.value || ""),
          city: (form.elements.city?.value || "").trim().slice(0, 80),
          institution: (form.elements.institution?.value || "").trim().slice(0, 120),
        } },
      });
      if (error) throw error;
      if (data.session && data.user) {
        setConfirmationRequired(false);
        const profile = await saveProfile(data.user.id, {
          displayName,
          bio: (form.elements.bio?.value || "").trim().slice(0, 300),
          interests: split(form.elements.interests?.value || ""),
          city: (form.elements.city?.value || "").trim().slice(0, 80),
          institution: (form.elements.institution?.value || "").trim().slice(0, 120),
          discoverable: true,
          pronouns: "", hobbies: [], languages: [], education: "", graduationYear: "",
          connectionGoals: [], website: "", instagram: "", linkedin: "",
        }, file || null);
        setSuccess("Your account and starter profile are ready.");
        if (profile) setTimeout(() => navigate("/", { replace: true }), 500);
      } else {
        setConfirmationRequired(true);
        setSuccess("Your starter profile has been saved. Check your email to confirm your address, then sign in to add a profile photo.");
      }
    } catch (error) {
      console.error("Registration failed:", error);
      if (error.message?.toLowerCase().includes("already registered")) setErr("An account already exists with this email. Try signing in.");
      else if (error.message?.toLowerCase().includes("password")) setErr("Choose a stronger password and try again.");
      else setErr(error.message || "Registration couldn't be completed. Check your details and try again.");
    } finally {
      setLoading(false);
    }
  };

  return <main className="authPage authPage--register"><section className="authCard registerCard authCard--register">
    <p className="eyebrow">YOUR NEXT CHAPTER</p><h1>Create your account.</h1><p className="muted">Start with the basics. You can build out your profile whenever you’re ready.</p>
    {success ? <div role="status"><p>{success}</p>{confirmationRequired
      ? <Link className="authContinueLink" to="/login">Continue to sign in</Link>
      : <button type="button" onClick={() => navigate("/", { replace: true })}>Continue to Third Wheel</button>}</div> :
    <form onSubmit={handleSubmit} className="stack">
      <label>Display name<input required name="displayName" maxLength="80" autoComplete="name" /></label>
      <label>Email address<input required name="email" type="email" autoComplete="email" /></label>
      <label>Password<input required name="password" type="password" minLength="8" autoComplete="new-password" /></label>
      <label className="fileLabel"><img src={Add} alt="" /> Profile photo (optional)<input name="avatar" type="file" accept="image/*" /></label>
      <details><summary>Add a little about yourself now (optional)</summary>
        <label>Bio<textarea name="bio" rows="3" maxLength="300" /></label>
        <label>Interests<input name="interests" placeholder="Reading, technology, music" /></label>
        <label>City<input name="city" maxLength="80" /></label>
        <label>College or university<input name="institution" maxLength="120" /></label>
      </details>
      <button disabled={loading || !supabase}>{loading ? "Creating account…" : "Create account"}</button>
      {err && <p role="alert" className="errorText">{err}</p>}
    </form>}
    {!success && <p>Already have an account? <Link to="/login">Sign in</Link></p>}
  </section></main>;
};
export default Register;
