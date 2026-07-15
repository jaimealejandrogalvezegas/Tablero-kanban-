// js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// TU CONFIGURACIÓN REAL DE FIREBASE
export const firebaseConfig = {
  apiKey: "AIzaSyDeDayD3sez1jTG-S8SlOyRnjbMA_IGB0I",
  authDomain: "kanban-kallpa.firebaseapp.com",
  projectId: "kanban-kallpa",
  storageBucket: "kanban-kallpa.firebasestorage.app",
  messagingSenderId: "548152702710",
  appId: "1:548152702710:web:0d2b6af8137c8f14b85ed7",
  measurementId: "G-R2PM9NMV1M"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Exportar los servicios que usaremos
export const auth = getAuth(app);
export const db = getFirestore(app);
