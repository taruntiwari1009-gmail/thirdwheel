import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import Profile from "./pages/Profile";
import EditProfile from "./pages/EditProfile";
import ProtectedRoute from "./components/ProtectedRoute";
import "./style.scss";
import { BrowserRouter, Routes, Route } from "react-router-dom";

function App() {
  return <BrowserRouter><Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
    <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
    <Route path="/profile/:uid" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
    <Route path="/profile/edit" element={<ProtectedRoute><EditProfile /></ProtectedRoute>} />
  </Routes></BrowserRouter>;
}
export default App;
