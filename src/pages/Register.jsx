import React, { useState } from "react";
import Add from "../img/addAvatar.png";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth, db, storage } from "../firebase";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { doc, setDoc } from "firebase/firestore";
import { useNavigate, Link } from "react-router-dom";
import { isAllowedImage } from "../utils/chat";

// A lightweight local placeholder keeps profiles usable when Storage is unavailable.
const DEFAULT_AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'%3E%3Crect width='96' height='96' rx='48' fill='%23d9d9e8'/%3E%3Ccircle cx='48' cy='35' r='17' fill='%23808099'/%3E%3Cpath d='M17 88c2-19 14-29 31-29s29 10 31 29' fill='%23808099'/%3E%3C/svg%3E";

const Register = () => {
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState(false);
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

    if (!displayName) {
      setErr("Enter a display name.");
      setLoading(false);
      return;
    }

    if (file && !isAllowedImage(file)) {
      setErr("Choose an image file smaller than 5 MB, or leave the avatar blank.");
      setLoading(false);
      return;
    }

    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      let photoURL = DEFAULT_AVATAR;

      // Avatar uploads are optional. A Storage/billing error must not block account creation.
      if (file) {
        try {
          const storageRef = ref(
            storage,
            `avatars/${credential.user.uid}/${Date.now()}-${file.name}`
          );
          const uploadTask = uploadBytesResumable(storageRef, file);
          await uploadTask;
          photoURL = await getDownloadURL(uploadTask.snapshot.ref);
        } catch (uploadError) {
          console.warn("Avatar upload skipped; using the default avatar:", uploadError);
        }
      }

      // Create the searchable profile before the optional Auth display-name update.
      // Email remains in Firebase Authentication, not the public profile.
      await setDoc(doc(db, "publicProfiles", credential.user.uid), {
        uid: credential.user.uid,
        displayName,
        displayNameLower: displayName.toLowerCase(),
        photoURL,
      });

      try {
        await updateProfile(credential.user, { displayName, photoURL });
      } catch (profileError) {
        // The Firestore profile is already created, so this does not invalidate registration.
        console.warn("Firebase Auth profile update could not be completed:", profileError);
      }

      setSuccess(true);
    } catch (error) {
      console.error("Registration failed:", error);
      if (error.code === "auth/email-already-in-use") {
        setErr("An account already exists with this email. Try signing in instead.");
      } else if (error.code === "permission-denied" || error.code === "firestore/permission-denied") {
        setErr("Your account was created, but its profile could not be saved. Please contact support.");
      } else {
        setErr("Registration could not be completed. Please check your details and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="formContainer">
      <div className="formWrapper">
        <span className="logo">Third Wheel</span>
        <span className="title">{success ? "You're all set!" : "Register"}</span>
        {success ? (
          <div role="status">
            <p>Your account was created successfully. You can now start using Third Wheel.</p>
            <button type="button" onClick={() => navigate("/", { replace: true })}>
              Continue to Third Wheel
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <input required name="displayName" type="text" placeholder="display name" maxLength={80} />
            <input required name="email" type="email" placeholder="email" />
            <input required name="password" type="password" placeholder="password" />
            <input
              name="avatar"
              accept="image/*"
              style={{ display: "none" }}
              type="file"
              id="register-avatar"
            />
            <label htmlFor="register-avatar">
              <img src={Add} alt="" />
              <span>Add an avatar (optional)</span>
            </label>
            <button disabled={loading}>
              {loading ? "Creating account..." : "Sign up"}
            </button>
            {err && <span role="alert">{err}</span>}
          </form>
        )}
        {!success && (
          <p>
            You already have an account? <Link to="/login">Login</Link>
          </p>
        )}
      </div>
    </div>
  );
};

export default Register;
