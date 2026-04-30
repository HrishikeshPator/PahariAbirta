// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";
import { getMessaging } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-messaging.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDl1wr28EJQfhs-IL7T4A-k19eWK93SDXM",
  authDomain: "pahariabirta.firebaseapp.com",
  databaseURL: "https://pahariabirta-default-rtdb.firebaseio.com",
  projectId: "pahariabirta",
  storageBucket: "pahariabirta.firebasestorage.app",
  messagingSenderId: "517067527742",
  appId: "1:517067527742:web:60cc93f2b62111d896e36f"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export const storage = getStorage(app);
export const messaging = getMessaging(app);
