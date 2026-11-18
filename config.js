// ============================================================
// CONFABULATOR — settings
// This is the only file you need to edit to connect your own
// Firebase project. Everything here is safe to commit to GitHub:
// Firebase web config is an identifier, not a password. What
// protects the data is firestore.rules.
// ============================================================

// 1) Firebase console → Project settings → General → Your apps → Web app → "SDK setup and configuration" → Config.
//    Paste the values below. While apiKey still says PASTE, the site runs in demo mode with sample entries.
export const firebaseConfig = {
  apiKey: "AIzaSyCzFRNZjab8b7-swjsGA2LZQfFeeVSCuIc",
  authDomain: "confabulator-43f9d.firebaseapp.com",
  projectId: "confabulator-43f9d",
  storageBucket: "confabulator-43f9d.firebasestorage.app",
  messagingSenderId: "652285272852",
  appId: "1:652285272852:web:fb342e442601296eb8d801",
};

// 2) Optional photo uploads through Cloudinary's free plan.
//    Cloudinary → Settings → Upload → Upload presets → Add preset → Signing mode: Unsigned.
//    Leave both blank and people can still paste an image link.
//    Never put your Cloudinary API secret here or anywhere in this repo.
export const cloudinary = {
  cloudName: "",
  uploadPreset: "",
};

// 3) Name and wording.
export const site = {
  name: "Confabulator",
  tagline: "Favorites from friends, with the story behind each one.",
  ownerName: "Jim", // shown in "ask Jim to add you"
};

// Categories the admin can add with one click from the Admin panel.
export const starterCategories = [
  "Restaurants",
  "Places to visit",
  "Books",
  "Music",
  "Movies & TV",
  "Podcasts",
  "Products",
  "Services & trades",
  "Recipes",
  "Other",
];
