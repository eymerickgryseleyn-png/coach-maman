// ============================================================
// Configuration Firebase
// ----------------------------------------------------------------
// Clés du projet "coach-maman"
// Console : https://console.firebase.google.com/project/coach-maman
// ============================================================

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyB9BsqrmrGq591gdc1e4gAlxq2GZdJ7VHA",
  authDomain: "coach-maman.firebaseapp.com",
  projectId: "coach-maman",
  storageBucket: "coach-maman.firebasestorage.app",
  messagingSenderId: "863464796864",
  appId: "1:863464796864:web:cfcee8633c29ec7214f325",
  measurementId: "G-TC21PPHJ50"
};

// Tant que la config n'est pas remplie, la sync est désactivée.
window.FIREBASE_READY = !Object.values(window.FIREBASE_CONFIG).some(v => v.startsWith('REMPLACE'));
