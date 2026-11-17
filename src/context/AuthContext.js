import { createContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

export const AuthContext = createContext();

export const AuthContextProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Backfill the normalized field for profiles created before prefix search.
          const profileRef = doc(db, "publicProfiles", user.uid);
          const profileSnapshot = await getDoc(profileRef);
          if (profileSnapshot.exists()) {
            const profile = profileSnapshot.data();
            const displayName = profile.displayName || user.displayName || "";
            const displayNameLower = displayName.toLowerCase();

            if (displayNameLower && profile.displayNameLower !== displayNameLower) {
              await updateDoc(profileRef, { displayNameLower });
            }
          }
        } catch (error) {
          // Authentication should remain available even if profile backfill is delayed.
          console.error("Unable to update searchable profile metadata:", error);
        }
      }

      setCurrentUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
