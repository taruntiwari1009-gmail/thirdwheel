import React, { useContext, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { ChatContext } from "../context/ChatContext";
import { getOrCreateConversation, searchProfiles } from "../services/backend";

const Search = () => {
  const [term, setTerm] = useState("");
  const [users, setUsers] = useState([]);
  const [err, setErr] = useState("");
  const [searching, setSearching] = useState(false);
  const [selectingUid, setSelectingUid] = useState(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [visibleCount, setVisibleCount] = useState(10);
  const searchGeneration = useRef(0);
  const { currentUser } = useContext(AuthContext);
  const { dispatch } = useContext(ChatContext);

  useEffect(() => {
    const normalized = term.trim().toLowerCase().replace(/^@/, "");
    searchGeneration.current += 1;
    const generation = searchGeneration.current;
    let active = true;
    setUsers([]); setPage(0); setHasMore(false); setVisibleCount(10); setErr("");
    if (!normalized || !currentUser?.uid) { setSearching(false); return undefined; }
    const timeout = setTimeout(async () => {
      setSearching(true);
      try {
        const matches = await searchProfiles(normalized, currentUser.uid, 0);
        if (!active || generation !== searchGeneration.current) return;
        setUsers(matches);
        setHasMore(matches.length >= 30);
        if (!matches.length) setErr("No people found. Try a name or @username.");
      } catch (error) {
        console.error("User search failed:", error);
        if (!active || generation !== searchGeneration.current) return;
        setErr(error.code === "PGRST301" ? "Your session expired. Please sign in again." : "Search could not be completed. Please try again.");
      } finally {
        if (active && generation === searchGeneration.current) setSearching(false);
      }
    }, 250);
    return () => { active = false; clearTimeout(timeout); };
  }, [term, currentUser?.uid]);

  const loadMore = async () => {
    if (loadingMore || !hasMore || !currentUser?.uid) return;
    if (users.length > visibleCount) { setVisibleCount(count => count + 10); return; }
    const normalized = term.trim().toLowerCase().replace(/^@/, "");
    if (!normalized) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    const generation = searchGeneration.current;
    try {
      const matches = await searchProfiles(normalized, currentUser.uid, nextPage);
      if (generation !== searchGeneration.current) return;
      setUsers(previous => {
        const byId = new Map(previous.map(user => [user.uid, user]));
        matches.forEach(user => byId.set(user.uid, user));
        return [...byId.values()];
      });
      setPage(nextPage);
      setHasMore(matches.length >= 30);
      setVisibleCount(count => count + 10);
    } catch (error) {
      console.error("Unable to load more search results:", error);
      if (generation === searchGeneration.current) setErr("More people could not be loaded. Please try again.");
    } finally {
      if (generation === searchGeneration.current) setLoadingMore(false);
    }
  };

  const handleSelect = async selected => {
    if (!currentUser?.uid || !selected?.uid || selectingUid) return;
    setSelectingUid(selected.uid); setErr("");
    try {
      await getOrCreateConversation(currentUser.uid, selected.uid);
      dispatch({ type: "CHANGE_USER", payload: selected });
      setUsers([]); setTerm("");
    } catch (error) {
      console.error("Unable to open conversation:", error);
      setErr(error.message?.includes("discoverable") || error.message?.includes("blocked")
        ? "This person is unavailable for a new conversation."
        : "Could not open this conversation. Please try again.");
    } finally { setSelectingUid(null); }
  };

  return <section className="search" aria-label="Find people">
    <label className="searchLabel" htmlFor="people-search">Find your people</label>
    <div className="searchForm">
      <span className="searchGlyph" aria-hidden="true">⌕</span>
      <input id="people-search" type="search" placeholder="Search name or @username…" aria-label="Search people by name or username" autoComplete="off" onChange={event => setTerm(event.target.value)} value={term} />
      {term && <button type="button" className="clearSearch" aria-label="Clear search" onClick={() => setTerm("")}>×</button>}
    </div>
    {searching && <><p className="searchStatus" role="status">Looking for people…</p><div className="searchSkeletons" aria-hidden="true">{[1, 2].map(item => <div className="searchSkeleton" key={item}><span /><i /><b /></div>)}</div></>}
    {!searching && err && <p className="searchStatus" role="status">{err}</p>}
    {users.length > 0 && <div className="searchResults" aria-label="Search results">
      {users.slice(0, visibleCount).map(user => <div className="userChat searchResult" key={user.uid}>
        {user.photoURL ? <img src={user.photoURL} alt="" /> : <span className="avatarFallback" aria-hidden="true">{(user.displayName || "T").trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()}</span>}
        <span className="userChatInfo">
          <Link className="personName" to={"/profile/" + user.uid}>{user.displayName || "Third Wheel member"}</Link>
          <span className="personHint">{[user.username ? "@" + user.username : "", user.city || "", (Array.isArray(user.interests) ? user.interests : []).slice(0, 2).join(" · ")].filter(Boolean).join(" · ") || "Community member"}</span>
        </span>
        <button type="button" className="startChatButton" onClick={() => handleSelect(user)} disabled={Boolean(selectingUid)}>{selectingUid === user.uid ? "Opening…" : "Say hello"}</button>
      </div>)}
      {(users.length > visibleCount || hasMore) && <button type="button" className="loadMoreResults" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading…" : "Show more people"}</button>}
    </div>}
  </section>;
};
export default Search;
