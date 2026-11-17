import { createContext, useContext, useReducer } from "react";
import { AuthContext } from "./AuthContext";
import { getChatId } from "../utils/chat";

export const ChatContext = createContext();

const INITIAL_STATE = {
  chatId: null,
  user: {},
};

export const chatReducer = (state, action) => {
  switch (action.type) {
    case "CHANGE_USER": {
      const selectedUser = action.payload;
      const chatId = getChatId(action.currentUserId, selectedUser?.uid);
      if (!chatId) {
        return state;
      }

      return {
        user: selectedUser,
        chatId,
      };
    }
    default:
      return state;
  }
};

export const ChatContextProvider = ({ children }) => {
  const { currentUser } = useContext(AuthContext);
  const [state, dispatch] = useReducer(chatReducer, INITIAL_STATE);

  const dispatchWithCurrentUser = (action) => {
    dispatch({ ...action, currentUserId: currentUser?.uid });
  };

  return (
    <ChatContext.Provider value={{ data: state, dispatch: dispatchWithCurrentUser }}>
      {children}
    </ChatContext.Provider>
  );
};
