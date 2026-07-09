// js/auth.js
import { auth, db } from './firebase-config.js';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let registrandoUsuario = false;

function mensajeAuth(error) {
  const mensajes = {
    'auth/email-already-in-use': 'Ese correo ya esta registrado. Inicia sesion con esa cuenta.',
    'auth/invalid-email': 'El correo no tiene un formato valido.',
    'auth/missing-password': 'Ingresa una contrasena.',
    'auth/weak-password': 'La contrasena debe tener al menos 6 caracteres.',
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
  const btnRegistro = document.getElementById('btn-registro');
  const inputEmail = document.getElementById('email');
  const inputPassword = document.getElementById('password');

  btnRegistro.addEventListener('click', async () => {
    const email = inputEmail.value.trim();
    const password = inputPassword.value;

    if (!email || !password) {
      alert("Ingresa correo y contrasena.");
      return;
    }

    if (password.length < 6) {
      alert("La contrasena debe tener al menos 6 caracteres.");
      return;
    }

    registrandoUsuario = true;
    btnRegistro.disabled = true;
    btnLogin.disabled = true;

    try {
      console.log("Creando usuario en Auth...");
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;
      console.log("Usuario creado en Auth:", uid);

      await setDoc(doc(db, "usuarios", uid), {
        email,
        nombre: email.split('@')[0],
        rol: "invitado",
        fechaCreacion: serverTimestamp()
      }, { merge: true });

      alert("Cuenta creada. Tu rol es Invitado (solo visualizacion).");
      window.location.href = 'kanban.html';
    } catch (error) {
      console.error("Error Firebase Auth:", error.code, error.message);
      alert("Error al crear cuenta: " + mensajeAuth(error) + "\n\nCodigo: " + error.code);
      registrandoUsuario = false;
      btnRegistro.disabled = false;
      btnLogin.disabled = false;
    }
  });

  btnLogin.addEventListener('click', async () => {
    const email = inputEmail.value.trim();
    const password = inputPassword.value;

    if (!email || !password) {
      alert("Ingresa correo y contrasena.");
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      window.location.href = 'kanban.html';
    } catch (error) {
      console.error("Error Firebase Auth:", error.code, error.message);
      alert("Error al iniciar sesion: " + mensajeAuth(error) + "\n\nCodigo: " + error.code);
    }
  });

  onAuthStateChanged(auth, (user) => {
    if (user && !registrandoUsuario && window.location.pathname.includes('index.html')) {
      window.location.href = 'kanban.html';
    }
  });
});
