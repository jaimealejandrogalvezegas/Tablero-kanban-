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
  deleteDoc,
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
let ordenUsuarios = {
  campo: 'nombre',
  direccion: 'asc'
};

function normalizarRol(rol) {
  if (rol === 'desarrollador') return 'miembro';
  return rol || 'invitado';
}

function fechaTexto(valor) {
  if (!valor) return '-';
  const fecha = valor.toDate ? valor.toDate() : new Date(valor);
  return Number.isNaN(fecha.getTime()) ? '-' : fecha.toLocaleString('es-PE');
}

function fechaOrden(valor) {
  if (!valor) return 0;
  const fecha = valor.toDate ? valor.toDate() : new Date(valor);
  return Number.isNaN(fecha.getTime()) ? 0 : fecha.getTime();
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

function mostrarCredencialesTemporales(email, rol, passwordTemporal) {
  document.getElementById('credencial-email').value = email;
  document.getElementById('credencial-rol').value = rol;
  document.getElementById('credencial-password').value = passwordTemporal;
  document.getElementById('modal-credenciales-usuario').classList.remove('oculto');
}

function valorOrdenUsuario(usuario, campo) {
  const nombre = usuario.nombre || (usuario.email ? usuario.email.split('@')[0] : 'Usuario');
  const valores = {
    nombre,
    email: usuario.email || '',
    rol: usuario.rol || '',
    estado: estadoUsuario(usuario),
    ultimoAcceso: fechaOrden(usuario.ultimoAcceso),
    fechaCreacion: fechaOrden(usuario.fechaCreacion)
  };
  return valores[campo] ?? '';
}

function actualizarIndicadoresOrden() {
  ['nombre', 'email', 'rol', 'estado', 'ultimoAcceso', 'fechaCreacion'].forEach(campo => {
    const indicador = document.getElementById(`orden-${campo}`);
    if (!indicador) return;
    indicador.textContent = ordenUsuarios.campo === campo
      ? (ordenUsuarios.direccion === 'asc' ? '↑' : '↓')
      : '↕';
  });
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
  }).sort((a, b) => {
    const valorA = valorOrdenUsuario(a, ordenUsuarios.campo);
    const valorB = valorOrdenUsuario(b, ordenUsuarios.campo);
    const resultado = typeof valorA === 'number' && typeof valorB === 'number'
      ? valorA - valorB
      : String(valorA).localeCompare(String(valorB), 'es', { sensitivity: 'base' });
    return ordenUsuarios.direccion === 'asc' ? resultado : -resultado;
  });

  actualizarIndicadoresOrden();

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
            <button class="btn-eliminar-usuario" onclick="eliminarRegistroUsuario('${usuario.id}', '${usuario.email || ''}')">
              Eliminar registro
            </button>
          ` : `
            <button class="btn-reactivar-usuario" onclick="mostrarLimiteResetPassword('${usuario.email || ''}')">
              Reset clave
            </button>
            <button class="btn-eliminar-usuario" onclick="desactivarUsuario('${usuario.id}', '${usuario.email || ''}')">
              Desactivar
            </button>
            <button class="btn-eliminar-usuario" onclick="eliminarRegistroUsuario('${usuario.id}', '${usuario.email || ''}')">
              Eliminar registro
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

window.ordenarUsuarios = (campo) => {
  if (ordenUsuarios.campo === campo) {
    ordenUsuarios.direccion = ordenUsuarios.direccion === 'asc' ? 'desc' : 'asc';
  } else {
    ordenUsuarios = { campo, direccion: 'asc' };
  }
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
      requiereCambioPassword: true,
      creadoPorUid: adminActual.uid,
      creadoPorEmail: adminActual.email,
      fechaCreacion: serverTimestamp(),
      ultimoAcceso: null
    });

    cerrarModalAgregarUsuario();
    mostrarCredencialesTemporales(email, rol, passwordTemporal);
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

window.copiarPasswordTemporal = async () => {
  const input = document.getElementById('credencial-password');
  input.focus();
  input.select();

  try {
    await navigator.clipboard.writeText(input.value);
    alert("Contrasena temporal copiada.");
  } catch (error) {
    document.execCommand('copy');
    alert("Contrasena seleccionada. Si no se copio automaticamente, presiona Ctrl + C.");
  }
};

window.cerrarModalCredenciales = () => {
  document.getElementById('modal-credenciales-usuario').classList.add('oculto');
  document.getElementById('credencial-email').value = '';
  document.getElementById('credencial-rol').value = '';
  document.getElementById('credencial-password').value = '';
};

window.cambiarRol = async (userId, nuevoRol) => {
  await updateDoc(doc(db, "usuarios", userId), { rol: nuevoRol });
  alert("Rol actualizado");
};

window.mostrarLimiteResetPassword = (email) => {
  const usuario = email ? ` para ${email}` : '';
  alert(
    `No se puede restablecer la contrasena${usuario} desde este frontend.\n\n` +
    "Para generar una nueva contrasena temporal real se necesita Firebase Admin SDK en un backend o Cloud Function. " +
    "En Firebase normalmente eso requiere configurar un entorno backend/plan Blaze."
  );
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

window.eliminarRegistroUsuario = async (userId, email) => {
  if (auth.currentUser && auth.currentUser.uid === userId) {
    alert("No puedes eliminar tu propio registro desde este panel.");
    return;
  }

  const texto = email ? `Eliminar el registro de ${email}?` : 'Eliminar este registro?';
  if (!confirm(texto + "\n\nSe quitara de la lista de usuarios. Si intenta iniciar sesion, el sistema rechazara el acceso porque ya no tendra registro activo.")) {
    return;
  }

  await deleteDoc(doc(db, "usuarios", userId));
  alert("Registro eliminado de la lista de usuarios.");
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
