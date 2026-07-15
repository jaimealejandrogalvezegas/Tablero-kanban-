import { auth, db, firebaseConfig } from './firebase-config.js';
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let usuarios = [];
let adminActual = null;

function normalizarRol(rol) {
  if (rol === 'desarrollador') return 'miembro';
  return rol || 'invitado';
}

function fechaTexto(valor) {
  if (!valor) return '-';
  const fecha = valor.toDate ? valor.toDate() : new Date(valor);
  return Number.isNaN(fecha.getTime()) ? '-' : fecha.toLocaleString('es-PE');
}

function estadoUsuario(usuario) {
  if (usuario.activo === false) return 'Desactivado';
  const ultimo = usuario.ultimoAcceso?.toDate ? usuario.ultimoAcceso.toDate() : null;
  if (!ultimo) return 'Sin acceso';
  const dias = (Date.now() - ultimo.getTime()) / 86400000;
  return dias <= 7 ? 'Activo' : 'Inactivo';
}

function generarPasswordTemporal() {
  const bloque = Math.random().toString(36).slice(2, 8);
  return `Kg-${bloque}-2026!`;
}

function obtenerNombreDesdeCorreo(email) {
  return email.split('@')[0].replace(/[._-]+/g, ' ');
}

function usuarioExistePorCorreo(email) {
  return usuarios.some(usuario => (usuario.email || '').toLowerCase() === email);
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }

  adminActual = user;
  const userDoc = await getDoc(doc(db, "usuarios", user.uid));
  if (!userDoc.exists() || userDoc.data().activo === false || normalizarRol(userDoc.data().rol) !== 'administrador') {
    alert("No tienes permisos de administrador");
    window.location.href = 'kanban.html';
    return;
  }

  cargarUsuarios();
});

function cargarUsuarios() {
  const q = query(collection(db, "usuarios"), orderBy("email"));
  onSnapshot(q, (snapshot) => {
    usuarios = snapshot.docs.map(documento => ({
      id: documento.id,
      ...documento.data(),
      rol: normalizarRol(documento.data().rol)
    }));
    renderizarUsuarios();
  }, (error) => {
    console.error("Error al cargar usuarios:", error);
  });
}

function renderizarUsuarios() {
  const lista = document.getElementById('lista-usuarios');
  const busqueda = document.getElementById('buscar-usuario').value.trim().toLowerCase();
  const filtroRol = document.getElementById('filtro-rol-admin').value;

  const filtrados = usuarios.filter(usuario => {
    const nombre = usuario.nombre || (usuario.email ? usuario.email.split('@')[0] : 'Usuario');
    const coincideTexto = !busqueda ||
      nombre.toLowerCase().includes(busqueda) ||
      (usuario.email || '').toLowerCase().includes(busqueda);
    const coincideRol = filtroRol === 'todos' || usuario.rol === filtroRol;
    return coincideTexto && coincideRol;
  }).sort((a, b) => (a.email || '').localeCompare(b.email || ''));

  if (filtrados.length === 0) {
    lista.innerHTML = '<tr><td colspan="7">No hay usuarios para mostrar.</td></tr>';
    return;
  }

  lista.innerHTML = filtrados.map(usuario => {
    const nombre = usuario.nombre || (usuario.email ? usuario.email.split('@')[0] : 'Usuario');
    return `
      <tr>
        <td>${nombre}</td>
        <td>${usuario.email || '-'}</td>
        <td>
          <select onchange="cambiarRol('${usuario.id}', this.value)">
            <option value="administrador" ${usuario.rol === 'administrador' ? 'selected' : ''}>Administrador</option>
            <option value="lider" ${usuario.rol === 'lider' ? 'selected' : ''}>Lider</option>
            <option value="miembro" ${usuario.rol === 'miembro' ? 'selected' : ''}>Miembro</option>
            <option value="invitado" ${usuario.rol === 'invitado' ? 'selected' : ''}>Invitado</option>
          </select>
        </td>
        <td><span class="estado-usuario ${estadoUsuario(usuario).toLowerCase().replace(' ', '-')}">${estadoUsuario(usuario)}</span></td>
        <td>${fechaTexto(usuario.ultimoAcceso)}</td>
        <td>${fechaTexto(usuario.fechaCreacion)}</td>
        <td>
          ${usuario.activo === false ? `
            <button class="btn-reactivar-usuario" onclick="reactivarUsuario('${usuario.id}', '${usuario.email || ''}')">
              Reactivar
            </button>
          ` : `
            <button class="btn-eliminar-usuario" onclick="desactivarUsuario('${usuario.id}', '${usuario.email || ''}')">
              Desactivar
            </button>
          `}
        </td>
      </tr>
    `;
  }).join('');
}

window.filtrarUsuariosAdmin = () => {
  renderizarUsuarios();
};

window.abrirModalAgregarUsuario = () => {
  document.getElementById('nuevo-usuario-email').value = '';
  document.getElementById('nuevo-usuario-rol').value = 'miembro';
  document.getElementById('modal-agregar-usuario').classList.remove('oculto');
};

window.cerrarModalAgregarUsuario = () => {
  document.getElementById('modal-agregar-usuario').classList.add('oculto');
};

window.crearUsuarioAdmin = async () => {
  const email = document.getElementById('nuevo-usuario-email').value.trim().toLowerCase();
  const rol = document.getElementById('nuevo-usuario-rol').value;

  if (!email || !email.endsWith('@kg.com.pe')) {
    alert("Ingresa un correo corporativo @kg.com.pe.");
    return;
  }

  if (!['administrador', 'lider', 'miembro', 'invitado'].includes(rol)) {
    alert("Selecciona un rol valido.");
    return;
  }

  if (usuarioExistePorCorreo(email)) {
    alert("Ese correo ya existe en la lista de usuarios.");
    return;
  }

  const passwordTemporal = generarPasswordTemporal();
  const nombreAppSecundaria = `crear-usuario-${Date.now()}`;
  const appSecundaria = initializeApp(firebaseConfig, nombreAppSecundaria);
  const authSecundario = getAuth(appSecundaria);
  let usuarioAuthCreado = null;

  try {
    const credencial = await createUserWithEmailAndPassword(authSecundario, email, passwordTemporal);
    usuarioAuthCreado = credencial.user;

    await setDoc(doc(db, "usuarios", credencial.user.uid), {
      email,
      nombre: obtenerNombreDesdeCorreo(email),
      rol,
      activo: true,
      estado: "activo",
      creadoPorUid: adminActual.uid,
      creadoPorEmail: adminActual.email,
      fechaCreacion: serverTimestamp(),
      ultimoAcceso: null
    });

    cerrarModalAgregarUsuario();
    alert(
      "Usuario creado correctamente.\n\n" +
      `Correo: ${email}\n` +
      `Rol: ${rol}\n` +
      `Contrasena temporal: ${passwordTemporal}\n\n` +
      "Entrega esa contrasena al usuario para que pueda iniciar sesion."
    );
  } catch (error) {
    if (usuarioAuthCreado) {
      await deleteUser(usuarioAuthCreado).catch((deleteError) => {
        console.warn("No se pudo revertir el usuario creado en Authentication:", deleteError);
      });
    }
    console.error("Error al crear usuario:", error);
    alert("No se pudo crear el usuario: " + (error.message || error.code));
  } finally {
    await signOut(authSecundario).catch(() => {});
    await deleteApp(appSecundaria).catch(() => {});
  }
};

window.cambiarRol = async (userId, nuevoRol) => {
  await updateDoc(doc(db, "usuarios", userId), { rol: nuevoRol });
  alert("Rol actualizado");
};

window.desactivarUsuario = async (userId, email) => {
  if (auth.currentUser && auth.currentUser.uid === userId) {
    alert("No puedes desactivar tu propio usuario desde este panel.");
    return;
  }

  const texto = email ? `Desactivar el usuario ${email}?` : 'Desactivar este usuario?';
  if (!confirm(texto + "\n\nEl usuario no podra entrar y, si tiene sesion abierta, sera expulsado del tablero.")) {
    return;
  }

  await updateDoc(doc(db, "usuarios", userId), {
    activo: false,
    fechaDesactivacion: serverTimestamp(),
    desactivadoPorUid: adminActual.uid,
    desactivadoPorEmail: adminActual.email
  });
  alert("Usuario desactivado.");
};

window.reactivarUsuario = async (userId, email) => {
  const texto = email ? `Reactivar el usuario ${email}?` : 'Reactivar este usuario?';
  if (!confirm(texto)) return;

  await updateDoc(doc(db, "usuarios", userId), {
    activo: true,
    estado: "activo",
    fechaReactivacion: serverTimestamp(),
    reactivadoPorUid: adminActual.uid,
    reactivadoPorEmail: adminActual.email
  });
  alert("Usuario reactivado.");
};

window.cerrarSesion = async () => {
  await signOut(auth);
  window.location.href = 'index.html';
};
