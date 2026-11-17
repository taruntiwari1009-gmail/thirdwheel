import React, { useContext, useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { Link, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { auth, db, storage } from "../firebase";
import { isAllowedImage } from "../utils/chat";

const fields = [
  ["username","Username","text"],["displayName","Display name","text"],["pronouns","Pronouns (optional)","text"],["bio","A little about you","textarea"],
  ["interests","Interests (comma separated)","list"],["hobbies","Hobbies (comma separated)","list"],
  ["languages","Languages (comma separated)","list"],["education","Course / field of study","text"],
  ["institution","College or university","text"],["graduationYear","Graduation year","text"],
  ["city","City","text"],["connectionGoals","What would you like to connect over? (comma separated)","list"],
  ["website","Website URL","url"],["instagram","Instagram URL","url"],["linkedin","LinkedIn URL","url"]
];
const split = value => value.split(",").map(x=>x.trim()).filter(Boolean).slice(0,20);

export default function EditProfile() {
  const { currentUser } = useContext(AuthContext);
  const navigate = useNavigate();
  const [form,setForm]=useState({}); const [avatar,setAvatar]=useState(null);
  const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false); const [error,setError]=useState("");

  useEffect(()=>{
    let alive=true;
    if(!currentUser?.uid) return;
    getDoc(doc(db,"publicProfiles",currentUser.uid)).then(snap=>{
      if(!alive)return;
      const p=snap.exists()?snap.data():{};
      setForm({...p,username:p.username||"",displayName:p.displayName||currentUser.displayName||"",
        interests:(p.interests||[]).join(", "),hobbies:(p.hobbies||[]).join(", "),
        languages:(p.languages||[]).join(", "),connectionGoals:(p.connectionGoals||[]).join(", ")});
    }).catch(()=>alive&&setError("Unable to load your profile.")).finally(()=>alive&&setLoading(false));
    return()=>{alive=false;};
  },[currentUser]);

  const change=(key,value)=>setForm(old=>({...old,[key]:value}));
  const save=async event=>{
    event.preventDefault();setSaving(true);setError("");
    const displayName=(form.displayName||"").trim();
    const username=(form.username||"").trim().replace(/^@/,"").toLowerCase();
    if(!displayName){setError("Display name is required.");setSaving(false);return;}
    if(username && !/^[a-z0-9_.]{3,24}$/.test(username)){setError("Username must be 3–24 characters and use letters, numbers, dots or underscores.");setSaving(false);return;}
    if(avatar&&!isAllowedImage(avatar)){setError("Choose an image smaller than 5 MB.");setSaving(false);return;}
    try{
      let photoURL=currentUser.photoURL||form.photoURL||"";
      if(avatar){
        const avatarRef=ref(storage,`avatars/${currentUser.uid}/${Date.now()}-${avatar.name}`);
        const task=uploadBytesResumable(avatarRef,avatar);await task;photoURL=await getDownloadURL(task.snapshot.ref);
      }
      const data={
        uid:currentUser.uid,username,displayName,displayNameLower:displayName.toLowerCase(),photoURL,discoverable:form.discoverable!==false,pronouns:(form.pronouns||"").trim().slice(0,40),
        bio:(form.bio||"").trim().slice(0,300),education:(form.education||"").trim().slice(0,100),
        institution:(form.institution||"").trim().slice(0,120),graduationYear:(form.graduationYear||"").trim().slice(0,4),
        city:(form.city||"").trim().slice(0,80),website:(form.website||"").trim().slice(0,300),
        instagram:(form.instagram||"").trim().slice(0,300),linkedin:(form.linkedin||"").trim().slice(0,300),
        interests:split(form.interests||""),hobbies:split(form.hobbies||""),languages:split(form.languages||""),
        connectionGoals:split(form.connectionGoals||"")
      };
      await setDoc(doc(db,"publicProfiles",currentUser.uid),data,{merge:true});
      await updateProfile(auth.currentUser,{displayName,photoURL});
      navigate("/profile",{replace:true});
    }catch(e){setError(avatar?"Profile couldn't be saved. If the photo upload failed, try saving without a new photo.":"Your profile couldn't be saved. Check your connection and try again.");}
    finally{setSaving(false);}
  };

  if(loading)return <main className="pageShell"><p role="status">Loading editor…</p></main>;
  return <main className="pageShell editPage"><header className="pageHeader"><Link to="/profile">← Your profile</Link><p className="eyebrow">MAKE IT YOURS</p></header>
    <h1>Edit your profile</h1><p className="muted">Share as much or as little as you like. Only your display name is required.</p>
    <form className="profileForm" onSubmit={save}>
      <label>Profile photo<input type="file" accept="image/*" onChange={e=>setAvatar(e.target.files?.[0]||null)} /></label>
      <label className="privacyToggle"><input type="checkbox" checked={form.discoverable!==false} onChange={e=>change("discoverable",e.target.checked)} /> Show my profile in search results</label>
      {avatar&&<p className="muted small">New photo selected: {avatar.name}</p>}
      {fields.map(([key,label,type])=><label key={key}>{label}
        {type==="textarea"?<textarea rows="4" maxLength="300" value={form[key]||""} onChange={e=>change(key,e.target.value)}/>:<input type={type==="list"?"text":type} maxLength={type==="list"?500:300} value={form[key]||""} onChange={e=>change(key,e.target.value)}/>}
      </label>)}
      <p className="muted small">Username is a profile label in this release; people can find you by display name. Turn off search visibility to hide your profile from discovery. Your email and authentication details are never public.</p>
      {error&&<p role="alert" className="errorText">{error}</p>}
      <div className="formActions"><Link to="/profile">Cancel</Link><button disabled={saving}>{saving?"Saving…":"Save profile"}</button></div>
    </form>
  </main>;
}
