import React, { useContext, useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import Chat from "../components/Chat";
import { ChatContext } from "../context/ChatContext";

const Home = () => {
  const { data } = useContext(ChatContext);
  const [mobileView, setMobileView] = useState("inbox");
  useEffect(() => { setMobileView(data.chatId ? "chat" : "inbox"); }, [data.chatId]);
  return <div className="home">
    <div className={`container mobile-${mobileView}`}>
      <Sidebar />
      <Chat />
    </div>
    <nav className="mobileNav" aria-label="Main navigation">
      <button type="button" className={mobileView === "inbox" ? "active" : ""} onClick={() => setMobileView("inbox")}>People & inbox</button>
      <button type="button" className={mobileView === "chat" ? "active" : ""} onClick={() => setMobileView("chat")} disabled={!data.chatId}>Conversation</button>
    </nav>
  </div>;
};
export default Home;
