// js/auth.js
import { auth, db } from './firebase-config.js';
import {
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

function mensajeAuth(error) {
  const mensajes = {
    'auth/invalid-email': 'El correo no tiene un formato valido.',
    'auth/missing-password': 'Ingresa una contrasena.',
    'auth/invalid-credential': 'Correo o contrasena incorrectos, o la cuenta aun no existe.',
    'auth/user-not-found': 'No existe una cuenta registrada con ese correo.',
    'auth/wrong-password': 'La contrasena no es correcta.',
    'auth/operation-not-allowed': 'El metodo Email/Password no esta habilitado en Firebase Authentication.',
    'auth/unauthorized-domain': 'Este dominio no esta autorizado en Firebase Authentication.',
    'auth/network-request-failed': 'No se pudo conectar con Firebase. Revisa tu conexion.'
  };

  return mensajes[error.code] || error.message;
}

document.addEventListener('DOMContentLoaded', () => {
  const btnLogin = document.getElementById('btn-login');
  const inputEmail = document.getElementById('email');
  const inputPassword = document.getElementById('password');

  btnLogin.addEventListener('click', async () => {
    const email = inputEmail.value.trim().toLowerCase();
    const password = inputPassword.value;

    if (!email || !password) {
      alert("Ingresa correo y contrasena.");
      return;
    }

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const usuarioRef = doc(db, "usuarios", userCredential.user.uid);
      const usuarioSnap = await getDoc(usuarioRef);

      if (!usuarioSnap.exists() || usuarioSnap.data().activo === false) {
        await signOut(auth);
        alert("Tu usuario esta inactivo o no fue creado por el administrador.");
        return;
      }

      await setDoc(usuarioRef, {
        ultimoAcceso: serverTimestamp()
      }, { merge: true });
      window.location.href = 'kanban.html';
    } catch (error) {
      console.error("Error Firebase Auth:", error.code, error.message);
      alert("Error al iniciar sesion: " + mensajeAuth(error) + "\n\nCodigo: " + error.code);
    }
  });

  onAuthStateChanged(auth, (user) => {
    if (user && window.location.pathname.includes('index.html')) {
      window.location.href = 'kanban.html';
    }
  });
});
