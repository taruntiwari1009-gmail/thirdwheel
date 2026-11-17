import React,{useContext}from"react";
import Cam from "../img/cam.png";
import Add from "../img/add.png";
import More from "../img/more.png";
import Messages from "./Messages";
import Input from "./Input";
import {ChatContext}from"../context/ChatContext";
import{Link}from"react-router-dom";

const Chat=()=>{
 const{data}=useContext(ChatContext);
 return <div className="chat">
  <div className="chatInfo">
   {data.user?.uid?<Link to={`/profile/${data.user.uid}`} className="chatPerson">{data.user.displayName||"Conversation"}<span>View profile</span></Link>:<span>Select someone to start a conversation</span>}
   <div className="chatIcons" aria-label="Conversation options">
    <img src={Cam} alt="" aria-hidden="true"/><img src={Add} alt="" aria-hidden="true"/><img src={More} alt="" aria-hidden="true"/>
   </div>
  </div>
  <Messages/><Input/>
 </div>;
};
export default Chat;
