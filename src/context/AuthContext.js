import { createContext, useCallback, useEffect, useRef, useState } from "react";
import { getProfile } from "../services/backend";
import { isSupabaseConfigured, supabase } from "../supabase";

export const AuthContext = createContext();

const normalizeUser = user => user ? ({
  uid: user.id,
  email: user.email || "",
  displayName: user.user_metadata?.display_name || "",
  photoURL: "",
  appMetadata: user.app_metadata || {},
  userMetadata: user.user_metadata || {},
}) : null;

export const AuthContextProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const authEventSeen = useRef(false);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return undefined;
    }
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      authEventSeen.current = true;
      setSession(nextSession || null);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) console.warn("Unable to restore Supabase session:", error);
      if (!authEventSeen.current) setSession(data?.session || null);
      setLoading(false);
    }).catch(error => {
      if (active) {
        console.warn("Unable to restore Supabase session:", error);
        setLoading(false);
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    const user = session?.user;
    if (!user) {
      setCurrentUser(null);
      return undefined;
    }
    const baseUser = normalizeUser(user);
    setCurrentUser(baseUser);
    getProfile(user.id).then(profile => {
      if (!active) return;
      setCurrentUser(previous => previous?.uid === user.id
        ? { ...baseUser, ...(profile || {}), appMetadata: user.app_metadata || {}, userMetadata: user.user_metadata || {} }
        : previous);
    }).catch(error => {
      console.warn("Profile metadata could not be loaded:", error);
    });
    return () => { active = false; };
  }, [session?.user]);

  const refreshCurrentUser = useCallback(async () => {
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const user = data.session?.user;
    if (!user) {
      setCurrentUser(null);
      return null;
    }
    const baseUser = normalizeUser(user);
    const profile = await getProfile(user.id);
    const refreshed = { ...baseUser, ...(profile || {}), appMetadata: user.app_metadata || {}, userMetadata: user.user_metadata || {} };
    setCurrentUser(refreshed);
    return refreshed;
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, loading, refreshCurrentUser, isSupabaseConfigured }}>
      {children}
    </AuthContext.Provider>
  );
};
