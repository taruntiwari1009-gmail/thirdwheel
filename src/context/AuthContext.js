import { createContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

export const AuthContext = createContext();

export const AuthContextProvider = ({ children }) => {
  const [currentUser,setCurrentUser] = useState(null);
  const [loading,setLoading] = useState(true);

  useEffect(() => {
    let active=true;
    const unsubscribe=onAuthStateChanged(auth,user=>{
      if(!active) return;
      // Auth readiness is independent of profile metadata repair. The app should
      // not remain behind a loading screen when Firestore is slow or unavailable.
      setCurrentUser(user || null);
      setLoading(false);
      if(user) {
        getDoc(doc(db,"publicProfiles",user.uid)).then(snapshot=>{
          if(!active || !snapshot.exists()) return;
          const profile=snapshot.data();
          const displayName=(profile.displayName || user.displayName || "").trim();
          const displayNameLower=displayName.toLowerCase();
          const patch={};
          if(displayName && profile.displayNameLower!==displayNameLower) patch.displayNameLower=displayNameLower;
          if(typeof profile.discoverable!=="boolean") patch.discoverable=true;
          if(Object.keys(patch).length) return updateDoc(doc(db,"publicProfiles",user.uid),patch);
        }).catch(error=>console.warn("Profile search metadata will be repaired later:",error));
      }
    });
    return ()=>{active=false;unsubscribe();};
  },[]);

  return <AuthContext.Provider value={{currentUser,loading}}>{children}</AuthContext.Provider>;
};
