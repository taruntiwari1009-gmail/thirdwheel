import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getFirestore } from "firebase/firestore";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

const firebaseConfig = {
  apiKey: "AIzaSyBTwrVWsJuGBxHI81Zbntykd3KMmZ_IZL8",
  authDomain: "thirdwheel-1009.firebaseapp.com",
  projectId: "thirdwheel-1009",
  storageBucket: "thirdwheel-1009.appspot.com",
  messagingSenderId: "67943380566",
  appId: "1:67943380566:web:3df2c37516b7cc78ffadf7",
};

export const app = initializeApp(firebaseConfig);

// Configure a real reCAPTCHA v3 site key in staging before enabling server enforcement.
// Leaving the variable unset keeps local development and emulator workflows unchanged.
const appCheckSiteKey = process.env.REACT_APP_FIREBASE_APPCHECK_SITE_KEY;
export const appCheck = appCheckSiteKey
  ? initializeAppCheck(app, { provider: new ReCaptchaV3Provider(appCheckSiteKey), isTokenAutoRefreshEnabled: true })
  : null;
export const auth = getAuth();
export const storage = getStorage();
export const db = getFirestore()
