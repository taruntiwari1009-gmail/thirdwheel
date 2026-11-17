import React, { useState } from "react";
import Add from "../img/addAvatar.png";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth, db, storage } from "../firebase";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { doc, setDoc } from "firebase/firestore";
import { useNavigate, Link } from "react-router-dom";

const Register = () => {
  const [err, setErr] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setErr(false);

    const form = event.currentTarget;
    const displayName = form.elements.displayName.value.trim();
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    const file = form.elements.avatar.files[0];

    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const storageRef = ref(storage, `avatars/${credential.user.uid}/${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);
      await uploadTask;
      const photoURL = await getDownloadURL(uploadTask.snapshot.ref);

      await updateProfile(credential.user, { displayName, photoURL });

      await setDoc(doc(db, "users", credential.user.uid), {
        uid: credential.user.uid,
        displayName,
        email,
        photoURL,
      });
      await setDoc(doc(db, "userChats", credential.user.uid), {});

      navigate("/", { replace: true });
    } catch (error) {
      console.error("Registration failed:", error);
      setErr(true);
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
          <input required name="displayName" type="text" placeholder="display name" />
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
          {err && <span role="alert">Registration failed. Please check your details and try again.</span>}
        </form>
        <p>
          You already have an account? <Link to="/login">Login</Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
