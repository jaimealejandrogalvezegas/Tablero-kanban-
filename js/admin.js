import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

function normalizarRol(rol) {
  if (rol === 'desarrollador') return 'miembro';
  return rol || 'invitado';
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }

  const userDoc = await getDoc(doc(db, "usuarios", user.uid));
  if (!userDoc.exists() || normalizarRol(userDoc.data().rol) !== 'administrador') {
    alert("No tienes permisos de administrador");
    window.location.href = 'kanban.html';
    return;
  }

  cargarUsuarios();
});

function cargarUsuarios() {
  const q = query(collection(db, "usuarios"), orderBy("email"));
  onSnapshot(q, (snapshot) => {
    const lista = document.getElementById('lista-usuarios');

    lista.innerHTML = snapshot.docs.map(documento => {
      const usuario = documento.data();
      const rol = normalizarRol(usuario.rol);
      const nombre = usuario.nombre || (usuario.email ? usuario.email.split('@')[0] : 'Usuario');

      return `
        <div class="usuario-card">
          <div>
            <strong>${nombre}</strong>
            <span>${usuario.email || 'Sin correo'}</span>
          </div>
          <div class="usuario-acciones">
            <select onchange="cambiarRol('${documento.id}', this.value)">
              <option value="administrador" ${rol === 'administrador' ? 'selected' : ''}>Administrador</option>
              <option value="lider" ${rol === 'lider' ? 'selected' : ''}>Lider</option>
              <option value="miembro" ${rol === 'miembro' ? 'selected' : ''}>Miembro</option>
              <option value="invitado" ${rol === 'invitado' ? 'selected' : ''}>Invitado</option>
            </select>
            <button class="btn-eliminar-usuario" onclick="eliminarUsuario('${documento.id}', '${usuario.email || ''}')">
              Eliminar
            </button>
          </div>
        </div>
      `;
    }).join('');
  }, (error) => {
    console.error("Error al cargar usuarios:", error);
  });
}

window.cambiarRol = async (userId, nuevoRol) => {
  await updateDoc(doc(db, "usuarios", userId), { rol: nuevoRol });
  alert("Rol actualizado");
};

window.eliminarUsuario = async (userId, email) => {
  if (auth.currentUser && auth.currentUser.uid === userId) {
    alert("No puedes eliminar tu propio usuario desde este panel.");
    return;
  }

  const texto = email ? `Eliminar el usuario ${email}?` : 'Eliminar este usuario?';
  if (!confirm(texto + "\n\nEsto borra su documento en Firestore, no su cuenta de Authentication.")) {
    return;
  }

  await deleteDoc(doc(db, "usuarios", userId));
  alert("Usuario eliminado de Firestore.");
};

window.cerrarSesion = async () => {
  await signOut(auth);
  window.location.href = 'index.html';
};
