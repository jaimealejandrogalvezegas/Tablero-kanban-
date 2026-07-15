// js/auth.js
import { auth, db } from './firebase-config.js';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc
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

function autorizacionId(email) {
  return email.toLowerCase().replaceAll('/', '_');
}

async function obtenerAutorizacion(email) {
  const ref = doc(db, "usuarios_autorizados", autorizacionId(email));
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const data = snap.data();
  if (data.usado || data.email !== email) return null;
  return { id: snap.id, ref, ...data };
}

async function registrarSolicitudAcceso(email) {
  const ref = doc(db, "usuarios_autorizados", autorizacionId(email));
  await setDoc(ref, {
    email,
    rolInicial: "miembro",
    usado: false,
    solicitud: true,
    estado: "pendiente",
    fechaSolicitud: serverTimestamp()
  }, { merge: true });
}

document.addEventListener('DOMContentLoaded', () => {
  const btnLogin = document.getElementById('btn-login');
  const btnRegistro = document.getElementById('btn-registro');
  const inputEmail = document.getElementById('email');
  const inputPassword = document.getElementById('password');

  btnRegistro.addEventListener('click', async () => {
    const email = inputEmail.value.trim().toLowerCase();
    const password = inputPassword.value;

    if (!email || !password) {
      alert("Ingresa correo y contrasena.");
      return;
    }

    if (password.length < 6) {
      alert("La contrasena debe tener al menos 6 caracteres.");
      return;
    }

    if (!email.endsWith('@kg.com.pe')) {
      alert("Solo se permiten correos corporativos @kg.com.pe.");
      return;
    }

    registrandoUsuario = true;
    btnRegistro.disabled = true;
    btnLogin.disabled = true;

    try {
      const autorizacion = await obtenerAutorizacion(email);
      if (!autorizacion) {
        await registrarSolicitudAcceso(email);
        alert("Solicitud enviada al administrador. Cuando te autoricen podras crear tu cuenta.");
        registrandoUsuario = false;
        btnRegistro.disabled = false;
        btnLogin.disabled = false;
        return;
      }

      console.log("Creando usuario en Auth...");
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;
      console.log("Usuario creado en Auth:", uid);

      await setDoc(doc(db, "usuarios", uid), {
        email,
        nombre: email.split('@')[0],
        rol: autorizacion.rolInicial || "invitado",
        activo: true,
        fechaCreacion: serverTimestamp(),
        ultimoAcceso: serverTimestamp()
      }, { merge: true });

      await updateDoc(autorizacion.ref, {
        usado: true,
        usadoPorUid: uid,
        fechaUso: serverTimestamp()
      });

      alert("Cuenta creada correctamente.");
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
        alert("Tu usuario esta inactivo o fue eliminado por el administrador.");
        return;
      }

      await setDoc(doc(db, "usuarios", userCredential.user.uid), {
        ultimoAcceso: serverTimestamp()
      }, { merge: true });
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
