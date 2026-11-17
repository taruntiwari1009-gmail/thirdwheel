import React, { useState } from "react";
import Add from "../img/addAvatar.png";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth, db, storage } from "../firebase";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { doc, setDoc } from "firebase/firestore";
import { useNavigate, Link } from "react-router-dom";
import { isAllowedImage } from "../utils/chat";

const Register = () => {
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setErr("");

    const form = event.currentTarget;
    const displayName = form.elements.displayName.value.trim();
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    const file = form.elements.avatar.files[0];

    if (!isAllowedImage(file)) {
      setErr("Choose an image smaller than 5 MB for your avatar.");
      setLoading(false);
      return;
    }

    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const storageRef = ref(storage, `avatars/${credential.user.uid}/${Date.now()}-${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);
      await uploadTask;
      const photoURL = await getDownloadURL(uploadTask.snapshot.ref);

      await updateProfile(credential.user, { displayName, photoURL });

      // Email remains in Firebase Authentication, not the searchable public profile.
      await setDoc(doc(db, "users", credential.user.uid), {
        uid: credential.user.uid,
        displayName,
        photoURL,
      });

      navigate("/", { replace: true });
    } catch (error) {
      console.error("Registration failed:", error);
      setErr("Registration could not be completed. If your account was created, try signing in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="formContainer">
      <div className="formWrapper">
        <span className="logo">Third Wheel</span>
        <span className="title">Register</span>
        <form onSubmit={handleSubmit}>
          <input required name="displayName" type="text" placeholder="display name" maxLength={80} />
          <input required name="email" type="email" placeholder="email" />
          <input required name="password" type="password" placeholder="password" />
          <input
            required
            name="avatar"
            accept="image/*"
            style={{ display: "none" }}
            type="file"
            id="register-avatar"
          />
          <label htmlFor="register-avatar">
            <img src={Add} alt="" />
            <span>Add an avatar</span>
          </label>
          <button disabled={loading}>
            {loading ? "Creating account..." : "Sign up"}
          </button>
          {err && <span role="alert">{err}</span>}
        </form>
        <p>
          You already have an account? <Link to="/login">Login</Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
