import React, { useState } from "react";
import Add from "../img/addAvatar.png";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth, db, storage } from "../firebase";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { doc, setDoc } from "firebase/firestore";
import { useNavigate, Link } from "react-router-dom";
import { isAllowedImage } from "../utils/chat";

const DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'%3E%3Crect width='96' height='96' rx='48' fill='%23d9d9e8'/%3E%3Ccircle cx='48' cy='35' r='17' fill='%23808099'/%3E%3Cpath d='M17 88c2-19 14-29 31-29s29 10 31 29' fill='%23808099'/%3E%3C/svg%3E";
const split = value => value.split(",").map(x=>x.trim()).filter(Boolean).slice(0,20);

const Register = () => {
  const [err,setErr] = useState(""); const [success,setSuccess] = useState(false); const [loading,setLoading] = useState(false);
  const navigate = useNavigate();
  const handleSubmit = async event => {
    event.preventDefault(); if(loading) return;
    setLoading(true); setErr("");
    const form=event.currentTarget;
    const displayName=form.elements.displayName.value.trim();
    const email=form.elements.email.value.trim();
    const password=form.elements.password.value;
    const file=form.elements.avatar.files[0];
    if(!displayName){setErr("Enter a display name.");setLoading(false);return;}
    if(file && !isAllowedImage(file)){setErr("Choose an image smaller than 5 MB, or leave the avatar blank.");setLoading(false);return;}
    let credential;
    try {
      credential=await createUserWithEmailAndPassword(auth,email,password);
      let photoURL=DEFAULT_AVATAR;
      if(file) try {
        const storageRef=ref(storage,`avatars/${credential.user.uid}/${Date.now()}-${file.name}`);
        const task=uploadBytesResumable(storageRef,file); await task; photoURL=await getDownloadURL(task.snapshot.ref);
      } catch(uploadError){console.warn("Avatar upload skipped:",uploadError);}
      const profile={
        uid:credential.user.uid, displayName, displayNameLower:displayName.toLowerCase(), photoURL,
        bio:(form.elements.bio?.value||"").trim().slice(0,300),
        interests:split(form.elements.interests?.value||""),
        institution:(form.elements.institution?.value||"").trim().slice(0,120),
        city:(form.elements.city?.value||"").trim().slice(0,80),
        hobbies:[], languages:[], education:"", graduationYear:"", connectionGoals:[],
        website:"", instagram:"", linkedin:""
      };
      await setDoc(doc(db,"publicProfiles",credential.user.uid),profile);
      try { await updateProfile(credential.user,{displayName,photoURL}); } catch(e){console.warn("Auth profile metadata update failed:",e);}
      setSuccess(true);
    } catch(error) {
      console.error("Registration failed:",error);
      if(credential) setErr("Your login was created, but your profile could not be saved. Please sign in again later or contact support.");
      else if(error.code==="auth/email-already-in-use") setErr("An account already exists with this email. Try signing in.");
      else if(error.code==="auth/weak-password") setErr("Choose a password with at least 6 characters.");
      else setErr("Registration couldn't be completed. Check your details and try again.");
    } finally {setLoading(false);}
  };
  return <main className="authPage"><section className="authCard registerCard">
    <p className="eyebrow">THIRD WHEEL</p><h1>Create your account</h1><p className="muted">Start with the basics. You can build out your profile whenever you're ready.</p>
    {success ? <div role="status"><p>Your account and starter profile are ready.</p><button onClick={()=>navigate("/",{replace:true})}>Continue to Third Wheel</button></div> :
    <form onSubmit={handleSubmit} className="stack">
      <label>Display name<input required name="displayName" maxLength="80" autoComplete="name" /></label>
      <label>Email address<input required name="email" type="email" autoComplete="email" /></label>
      <label>Password<input required name="password" type="password" minLength="6" autoComplete="new-password" /></label>
      <label className="fileLabel"><img src={Add} alt="" /> Profile photo (optional)<input name="avatar" type="file" accept="image/*" /></label>
      <details><summary>Add a little about yourself now (optional)</summary>
        <label>Bio<textarea name="bio" rows="3" maxLength="300" /></label>
        <label>Interests<input name="interests" placeholder="Reading, technology, music" /></label>
        <label>City<input name="city" maxLength="80" /></label>
        <label>College or university<input name="institution" maxLength="120" /></label>
      </details>
      <button disabled={loading}>{loading?"Creating account…":"Create account"}</button>
      {err&&<p role="alert" className="errorText">{err}</p>}
    </form>}
    {!success&&<p>Already have an account? <Link to="/login">Sign in</Link></p>}
  </section></main>;
};
export default Register;
