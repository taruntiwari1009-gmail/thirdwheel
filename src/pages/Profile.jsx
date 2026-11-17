import React,{useContext,useEffect,useState}from"react";
import{doc,getDoc}from"firebase/firestore";
import{Link,useParams}from"react-router-dom";
import{AuthContext}from"../context/AuthContext";
import{db}from"../firebase";
const EMPTY={username:"",displayName:"",bio:"",interests:[],hobbies:[],languages:[],education:"",institution:"",graduationYear:"",city:"",connectionGoals:[],website:"",instagram:"",linkedin:""};
const list=v=>Array.isArray(v)?v:[];
export default function Profile(){
 const{uid}=useParams();const{currentUser}=useContext(AuthContext);const id=uid||currentUser?.uid;const owner=currentUser?.uid===id;
 const[profile,setProfile]=useState(EMPTY);const[loading,setLoading]=useState(true);const[error,setError]=useState("");
 useEffect(()=>{let active=true;if(!id)return;setLoading(true);getDoc(doc(db,"publicProfiles",id)).then(s=>{if(!active)return;if(!s.exists())setError("This profile isn't available.");else setProfile({...EMPTY,...s.data()});}).catch(()=>active&&setError("We couldn't load this profile.")).finally(()=>active&&setLoading(false));return()=>{active=false;};},[id]);
 if(loading)return <main className="pageShell"><p role="status">Loading profile…</p></main>;
 if(error)return <main className="pageShell"><p role="alert">{error}</p><Link to="/">Back to conversations</Link></main>;
 return <main className="pageShell profilePage">
  <header className="pageHeader"><Link to="/" className="textLink">← Third Wheel</Link>{owner&&<Link className="primaryLink" to="/profile/edit">Edit profile</Link>}</header>
  <section className="profileHero"><img className="profileAvatar" src={profile.photoURL||""} alt=""/><div><p className="eyebrow">COMMUNITY PROFILE</p><h1>{profile.displayName||"New member"}</h1>{profile.username&&<p className="muted">@{profile.username}</p>}<p className="muted">{profile.city||"Location not added"}</p></div></section>
  {profile.bio&&<section className="profileSection"><h2>About</h2><p>{profile.bio}</p></section>}
  <section className="profileGrid">{[["Interests",profile.interests],["Hobbies",profile.hobbies],["Languages",profile.languages],["Education",[profile.education,profile.institution,profile.graduationYear]],["Connect over",profile.connectionGoals]].map(([title,values])=><div className="profileSection" key={title}><h2>{title}</h2><p>{list(values).filter(Boolean).join(" · ")||"Not added yet"}</p></div>)}</section>
  <section className="profileSection"><h2>Elsewhere</h2><div className="linkRow">{profile.website&&<a href={profile.website} target="_blank" rel="noreferrer">Website</a>}{profile.instagram&&<a href={profile.instagram} target="_blank" rel="noreferrer">Instagram</a>}{profile.linkedin&&<a href={profile.linkedin} target="_blank" rel="noreferrer">LinkedIn</a>}{!profile.website&&!profile.instagram&&!profile.linkedin&&<span className="muted">No links added</span>}</div></section>
 </main>;
}
