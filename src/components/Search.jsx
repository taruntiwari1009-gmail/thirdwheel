import React,{useContext,useEffect,useState}from"react";
import{collection,doc,getDocs,limit,orderBy,query,runTransaction,serverTimestamp,where}from"firebase/firestore";
import{db}from"../firebase";import{AuthContext}from"../context/AuthContext";import{ChatContext}from"../context/ChatContext";import{getChatId}from"../utils/chat";
const Search=()=>{
 const[username,setUsername]=useState("");const[users,setUsers]=useState([]);const[err,setErr]=useState("");const[searching,setSearching]=useState(false);const[selectingUid,setSelectingUid]=useState(null);
 const{currentUser}=useContext(AuthContext);const{dispatch}=useContext(ChatContext);
 useEffect(()=>{const term=username.trim().toLowerCase();let active=true;setUsers([]);setErr("");if(!term||!currentUser?.uid){setSearching(false);return undefined;}
 const timeout=setTimeout(async()=>{setSearching(true);try{
 const q=query(collection(db,"publicProfiles"),where("discoverable","==",true),where("displayNameLower",">=",term),where("displayNameLower","<=",term+"\uf8ff"),orderBy("displayNameLower"),limit(10));
 const snap=await getDocs(q);if(!active)return;const matches=snap.docs.map(d=>d.data()).filter(p=>p.uid!==currentUser.uid);setUsers(matches);if(!matches.length)setErr("No users found. Try another name.");
 }catch(e){console.error("User search failed:",e);if(active)setErr("Search failed. Please try again.");}finally{if(active)setSearching(false);}},300);
 return()=>{active=false;clearTimeout(timeout);};},[username,currentUser?.uid]);
 const handleSelect=async selected=>{if(!currentUser?.uid||!selected?.uid||selectingUid)return;setSelectingUid(selected.uid);setErr("");const chatId=getChatId(currentUser.uid,selected.uid);
 if(!chatId){setErr("This conversation could not be opened.");setSelectingUid(null);return;}
 try{const chatRef=doc(db,"chats",chatId),currentEntryRef=doc(db,"users",currentUser.uid,"userChats",chatId),otherEntryRef=doc(db,"users",selected.uid,"userChats",chatId),currentProfileRef=doc(db,"publicProfiles",currentUser.uid),otherProfileRef=doc(db,"publicProfiles",selected.uid),participants=[currentUser.uid,selected.uid].sort();
 await runTransaction(db,async tx=>{const[chatSnap,currentEntry,otherEntry,currentProfile,otherProfile]=await Promise.all([tx.get(chatRef),tx.get(currentEntryRef),tx.get(otherEntryRef),tx.get(currentProfileRef),tx.get(otherProfileRef)]);
 if(!currentProfile.exists()||!otherProfile.exists())throw new Error("A profile is no longer available.");const mine=currentProfile.data(),theirs=otherProfile.data();
 if(!chatSnap.exists())tx.set(chatRef,{participants,messages:[]});else{const existing=chatSnap.data().participants||[];if(existing.length!==2||!participants.every(uid=>existing.includes(uid)))throw new Error("Conversation participants do not match.");}
 const mineInfo={uid:currentUser.uid,displayName:mine.displayName||currentUser.displayName||"",photoURL:mine.photoURL||""},theirInfo={uid:selected.uid,displayName:theirs.displayName||selected.displayName||"",photoURL:theirs.photoURL||selected.photoURL||""};
 if(!currentEntry.exists())tx.set(currentEntryRef,{userInfo:theirInfo,date:serverTimestamp()});if(!otherEntry.exists())tx.set(otherEntryRef,{userInfo:mineInfo,date:serverTimestamp()});
 });
 dispatch({type:"CHANGE_USER",payload:selected});setUsers([]);setUsername("");
 }catch(e){console.error("Unable to open conversation:",e);setErr("Could not open this conversation. Please try again.");}finally{setSelectingUid(null);}};
 return <div className="search"><div className="searchForm"><input type="text" placeholder="Find a user" aria-label="Find a user" autoComplete="off" onChange={e=>setUsername(e.target.value)} value={username}/></div>
 {searching&&<span role="status">Searching…</span>}{err&&!searching&&<span role="status">{err}</span>}
 {users.map(user=><div className="userChat" key={user.uid} onClick={()=>handleSelect(user)} role="button" tabIndex={0} aria-disabled={Boolean(selectingUid)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();handleSelect(user);}}}><img src={user.photoURL||""} alt=""/><div className="userChatInfo"><span>{user.displayName}</span></div>{selectingUid===user.uid&&<span>Opening…</span>}</div>)}
 </div>;
};export default Search;