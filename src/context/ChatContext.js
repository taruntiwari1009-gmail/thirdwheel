import { createContext, useContext, useEffect, useReducer } from "react";
import { AuthContext } from "./AuthContext";

export const ChatContext = createContext();

const INITIAL_STATE = { chatId: null, user: {} };

export const chatReducer = (state, action) => {
  switch (action.type) {
    case "CHANGE_USER": {
      const selectedUser = action.payload;
      if (!action.chatId || !selectedUser?.uid) return state;
      return { user: selectedUser, chatId: action.chatId };
    }
    case "RESET":
      return INITIAL_STATE;
    default:
      return state;
  }
};

export const ChatContextProvider = ({ children }) => {
  const { currentUser } = useContext(AuthContext);
  const [state, dispatch] = useReducer(chatReducer, INITIAL_STATE);

  useEffect(() => {
    dispatch({ type: "RESET" });
  }, [currentUser?.uid]);

  const dispatchWithCurrentUser = action => dispatch(action);

  return (
    <ChatContext.Provider value={{ data: state, dispatch: dispatchWithCurrentUser }}>
      {children}
    </ChatContext.Provider>
  );
};
