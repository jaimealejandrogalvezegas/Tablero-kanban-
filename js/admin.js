import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
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
let autorizados = [];
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

function autorizacionId(email) {
  return email.toLowerCase().replaceAll('/', '_');
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
  cargarAutorizados();
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
  });

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

function cargarAutorizados() {
  const q = query(collection(db, "usuarios_autorizados"), orderBy("email"));
  onSnapshot(q, (snapshot) => {
    autorizados = snapshot.docs.map(documento => ({ id: documento.id, ...documento.data() }));
    renderizarAutorizados();
  }, (error) => {
    console.error("Error al cargar autorizaciones:", error);
  });
}

function renderizarAutorizados() {
  const lista = document.getElementById('lista-autorizados');
  if (autorizados.length === 0) {
    lista.innerHTML = '<tr><td colspan="6">No hay correos autorizados.</td></tr>';
    return;
  }

  lista.innerHTML = autorizados.map(item => `
    <tr>
      <td>${item.email}</td>
      <td>${item.rolInicial || 'miembro'}</td>
      <td>${item.cancelado ? 'Cancelado' : (item.usado ? 'Usado' : 'Pendiente')}</td>
      <td>${item.autorizadoPorEmail || '-'}</td>
      <td>${fechaTexto(item.fechaCreacion)}</td>
      <td>
        ${item.usado ? '-' : `<button class="btn-eliminar-usuario" onclick="eliminarAutorizacion('${item.id}', '${item.email}')">Eliminar</button>`}
      </td>
    </tr>
  `).join('');
}

window.filtrarUsuariosAdmin = () => {
  renderizarUsuarios();
};

window.cambiarRol = async (userId, nuevoRol) => {
  await updateDoc(doc(db, "usuarios", userId), { rol: nuevoRol });
  alert("Rol actualizado");
};

window.desactivarUsuario = async (userId, email) => {
  if (auth.currentUser && auth.currentUser.uid === userId) {
    alert("No puedes eliminar tu propio usuario desde este panel.");
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
    fechaReactivacion: serverTimestamp(),
    reactivadoPorUid: adminActual.uid,
    reactivadoPorEmail: adminActual.email
  });
  alert("Usuario reactivado.");
};

window.abrirModalAutorizar = () => {
  document.getElementById('authz-email').value = '';
  document.getElementById('authz-rol').value = 'miembro';
  document.getElementById('modal-autorizar').classList.remove('oculto');
};

window.cerrarModalAutorizar = () => {
  document.getElementById('modal-autorizar').classList.add('oculto');
};

window.guardarAutorizacion = async () => {
  const email = document.getElementById('authz-email').value.trim().toLowerCase();
  const rolInicial = document.getElementById('authz-rol').value;

  if (!email || !email.endsWith('@kg.com.pe')) {
    alert("Ingresa un correo corporativo @kg.com.pe.");
    return;
  }

  if (autorizados.some(item => item.email === email && !item.usado)) {
    alert("Este correo ya esta autorizado y pendiente de uso.");
    return;
  }

  await setDoc(doc(db, "usuarios_autorizados", autorizacionId(email)), {
    email,
    rolInicial,
    usado: false,
    autorizadoPorUid: adminActual.uid,
    autorizadoPorEmail: adminActual.email,
    fechaCreacion: serverTimestamp()
  });

  cerrarModalAutorizar();
  alert("Correo autorizado correctamente.");
};

window.eliminarAutorizacion = async (authId, email) => {
  if (!confirm(`Eliminar autorizacion para ${email}?`)) return;
  await updateDoc(doc(db, "usuarios_autorizados", authId), {
    usado: true,
    cancelado: true,
    fechaCancelacion: serverTimestamp(),
    canceladoPorUid: adminActual.uid,
    canceladoPorEmail: adminActual.email
  });
};

window.cerrarSesion = async () => {
  await signOut(auth);
  window.location.href = 'index.html';
};
