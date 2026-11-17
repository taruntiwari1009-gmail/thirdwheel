import { createContext, useContext, useReducer } from "react";
import { AuthContext } from "./AuthContext";

export const ChatContext = createContext();

const INITIAL_STATE = {
  chatId: null,
  user: {},
};

const chatReducer = (state, action) => {
  switch (action.type) {
    case "CHANGE_USER": {
      const selectedUser = action.payload;
      if (!selectedUser?.uid || !action.currentUserId) {
        return state;
      }

      return {
        user: selectedUser,
        chatId:
          action.currentUserId > selectedUser.uid
            ? action.currentUserId + selectedUser.uid
            : selectedUser.uid + action.currentUserId,
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
