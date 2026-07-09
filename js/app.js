// js/app.js
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { obtenerOCrearTablero } from './tableros.js';
import { escucharComentarios, agregarComentario } from './comentarios.js';
import { registrarActividad, ACCIONES } from './actividad.js';
import { agregarSubtarea, escucharSubtareas, toggleSubtarea, eliminarSubtarea } from './subtareas.js';
import { crearSprint, escucharSprints, actualizarEstadoSprint, eliminarSprint } from './sprints.js';
import { crearEtiqueta, escucharEtiquetas, eliminarEtiqueta } from './etiquetas.js';
import { escucharNotificaciones, marcarLeida, crearNotificacion } from './notificaciones.js';
import { crearInvitacion, escucharInvitaciones, eliminarInvitacion } from './invitaciones.js';
import { obtenerConfig, guardarConfig as guardarConfigFirestore } from './config.js';
import { escucharAdjuntos, agregarAdjunto, eliminarAdjunto } from './adjuntos.js';


let tableroActualId = null;
let tareas = [];
let usuarios = [];
let unsubTareas = [];
let unsubUsuarios = null;
let subtareasTemp = [];
let tareaEditandoId = null;
let usuarioActual = null;
let miRol = 'invitado';
let unsubComentarios = null;
let unsubSubtareas = null;
let unsubAdjuntos = null;
let sprints = [];
let unsubSprints = null;
let etiquetas = [];
let unsubEtiquetas = null;
let etiquetasSeleccionadas = [];
let unsubNotificaciones = null;
let notificaciones = [];
let unsubInvitaciones = null;
let renderTiempoInterval = null;
let temaOscuroUsuario = false;
let vistaActual = 'kanban';

const rolesConTareasGlobales = ['administrador', 'lider'];
const rolesQueCrean = ['administrador', 'lider'];

function normalizarRol(rol) {
  if (rol === 'desarrollador') return 'miembro';
  return rol || 'invitado';
}

function esAdmin() {
  return miRol === 'administrador';
}

function esLider() {
  return miRol === 'lider';
}

function puedeVerTodo() {
  return rolesConTareasGlobales.includes(miRol);
}

function puedeCrearTareas() {
  return rolesQueCrean.includes(miRol);
}

function tareaEsPropia(tarea) {
  return tarea.asignadoUid === usuarioActual.uid ||
    tarea.asignadoEmail === usuarioActual.email ||
    tarea.asignado === usuarioActual.email ||
    tarea.creadoPorUid === usuarioActual.uid;
}

function puedeEditarTarea(tarea) {
  return esAdmin() || esLider() || (miRol === 'miembro' && tareaEsPropia(tarea));
}

function puedeMoverTarea(tarea) {
  return esAdmin() || esLider() || (miRol === 'miembro' && tareaEsPropia(tarea));
}

function puedeEditarCamposGestion() {
  return esAdmin() || esLider();
}

function nombreUsuario(usuario) {
  return usuario.nombre || (usuario.email ? usuario.email.split('@')[0] : 'Usuario');
}

function usuarioPorUid(uid) {
  return usuarios.find(u => u.id === uid);
}

function usuarioPorEmail(email) {
  return usuarios.find(u => u.email === email);
}

function textoAsignado(tarea) {
  const usuario = usuarioPorUid(tarea.asignadoUid) || usuarioPorEmail(tarea.asignadoEmail || tarea.asignado);
  return usuario ? nombreUsuario(usuario) : (tarea.asignadoEmail || tarea.asignado || 'Sin asignar');
}

function fechaFirestoreAdate(valor) {
  if (!valor) return null;
  if (valor.toDate) return valor.toDate();
  if (valor instanceof Date) return valor;
  return new Date(valor);
}

function segundosRegistrados(tarea) {
  let total = Number(tarea.tiempoTotalSegundos || 0);
  if (tarea.temporizadorActivo && tarea.temporizadorInicio) {
    const inicio = fechaFirestoreAdate(tarea.temporizadorInicio);
    if (inicio && !Number.isNaN(inicio.getTime())) {
      total += Math.max(0, Math.floor((Date.now() - inicio.getTime()) / 1000));
    }
  }
  return total;
}

function formatearTiempo(segundos) {
  const total = Math.max(0, Math.floor(segundos || 0));
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const seg = total % 60;
  return [horas, minutos, seg].map(n => String(n).padStart(2, '0')).join(':');
}

function aplicarTemaOscuro(activo) {
  temaOscuroUsuario = !!activo;
  document.body.classList.toggle('modo-oscuro', temaOscuroUsuario);
}

function limpiarListeners() {
  unsubTareas.forEach(unsub => unsub());
  unsubTareas = [];
  if (unsubUsuarios) unsubUsuarios();
  unsubUsuarios = null;
}

onAuthStateChanged(auth, async (user) => {
  limpiarListeners();

  if (!user) {
    window.location.href = 'index.html';
    return;
  }

  usuarioActual = user;

  try {
    const usuarioRef = doc(db, "usuarios", user.uid);
    const userDoc = await getDoc(usuarioRef);

    if (userDoc.exists()) {
      const datosUsuario = userDoc.data();
      miRol = normalizarRol(datosUsuario.rol);
      aplicarTemaOscuro(!!datosUsuario.temaOscuro);
    } else {
      await setDoc(usuarioRef, {
        email: user.email,
        nombre: user.email.split('@')[0],
        rol: 'invitado',
        temaOscuro: false,
        fechaCreacion: serverTimestamp()
      });
      miRol = 'invitado';
      aplicarTemaOscuro(false);
    }
  } catch (error) {
    console.error("Error al obtener rol:", error);
  }

  document.getElementById('nombre-usuario').textContent = user.email;
  document.getElementById('rol-usuario').textContent = miRol.toUpperCase();

  configurarToolbar();
  escucharUsuarios();
  // Obtener o crear el tablero principal
  tableroActualId = await obtenerOCrearTablero(user.uid);
  const configTablero = await obtenerConfig(tableroActualId);
  vistaActual = configTablero.vistaDefault || 'kanban';
  cargarSprints(); 
  cargarEtiquetas();
  cargarNotificaciones();
  escucharTareas();
  iniciarRefrescoTiempo();
});

function configurarToolbar() {
  const btnNuevaTarea = document.getElementById('btn-nueva-tarea');
  const btnAdmin = document.getElementById('btn-admin');
  const filtroUsuario = document.getElementById('filtro-usuario');
  const btnConfig = document.getElementById('btn-config');

  btnNuevaTarea.style.display = puedeCrearTareas() ? 'inline-flex' : 'none';
  btnAdmin.style.display = esAdmin() ? 'inline-flex' : 'none';
  filtroUsuario.style.display = puedeVerTodo() ? 'block' : 'none';
  if (btnConfig) btnConfig.style.display = 'inline-flex';

}

function escucharUsuarios() {
  if (!puedeVerTodo()) {
    usuarios = [{
      id: usuarioActual.uid,
      email: usuarioActual.email,
      nombre: usuarioActual.email.split('@')[0],
      rol: miRol
    }];
    llenarSelectUsuarios();
    return;
  }

  const q = query(collection(db, "usuarios"), orderBy("email"));
  unsubUsuarios = onSnapshot(q, (snapshot) => {
    usuarios = snapshot.docs.map(documento => ({
      id: documento.id,
      ...documento.data(),
      rol: normalizarRol(documento.data().rol)
    }));
    llenarSelectUsuarios();
    renderizar();
  }, (error) => {
    console.error("Error al cargar usuarios:", error);
  });
}

function llenarSelectUsuarios() {
  const filtroUsuario = document.getElementById('filtro-usuario');
  const asignado = document.getElementById('inp-asignado');

  filtroUsuario.innerHTML = '<option value="todos">Todos los usuarios</option>' +
    usuarios.map(u => `<option value="${u.id}">${nombreUsuario(u)} (${u.email})</option>`).join('');

  asignado.innerHTML = '<option value="">-- Sin asignar --</option>' +
    usuarios.map(u => `<option value="${u.id}">${nombreUsuario(u)} (${u.email})</option>`).join('');
}

function escucharTareas() {
  tareas = [];

  if (puedeVerTodo()) {
    const q = query(collection(db, "tareas"), orderBy("fechaCreacion", "desc"));
    unsubTareas.push(onSnapshot(q, (snapshot) => {
      tareas = snapshot.docs.map(documento => ({ id: documento.id, ...documento.data() }));
      renderizar();
    }, (error) => console.error("Error al cargar tareas:", error)));
    return;
  }

  const tareasPorId = new Map();
  const refrescar = (snapshot) => {
    snapshot.docs.forEach(documento => tareasPorId.set(documento.id, { id: documento.id, ...documento.data() }));
    tareas = Array.from(tareasPorId.values());
    renderizar();
  };

  const consultas = [
    query(collection(db, "tareas"), where("asignadoUid", "==", usuarioActual.uid)),
    query(collection(db, "tareas"), where("asignadoEmail", "==", usuarioActual.email)),
    query(collection(db, "tareas"), where("asignado", "==", usuarioActual.email))
  ];

  consultas.forEach(q => {
    unsubTareas.push(onSnapshot(q, refrescar, (error) => console.error("Error al cargar mis tareas:", error)));
  });
}

window.cerrarSesion = async () => {
  await signOut(auth);
  window.location.href = 'index.html';
};

window.abrirPanelAdmin = () => {
  if (!esAdmin()) {
    alert("Solo el administrador puede entrar al panel de usuarios.");
    return;
  }

  window.location.href = 'admin.html';
};

function tareasFiltradas() {
  const filtro = document.getElementById('filtro-usuario').value;
  let lista = puedeVerTodo() ? tareas : tareas.filter(tareaEsPropia);

  if (puedeVerTodo() && filtro !== 'todos') {
    lista = lista.filter(t => t.asignadoUid === filtro);
  }

  return lista;
}

function renderizar() {
  const tablero = document.querySelector('.tablero');
  const vistaLista = document.getElementById('vista-lista');
  if (tablero && vistaLista) {
    tablero.classList.toggle('oculto', vistaActual === 'lista');
    vistaLista.classList.toggle('oculto', vistaActual !== 'lista');
  }

  const columnas = {
    pendiente: document.getElementById('col-pendiente'),
    en_proceso: document.getElementById('col-en_proceso'),
    terminado: document.getElementById('col-terminado')
  };

  Object.values(columnas).forEach(columna => columna.innerHTML = '');

  for (const estado of Object.keys(columnas)) {
    const tareasCol = tareasFiltradas().filter(t => t.estado === estado);
    tareasCol.forEach(t => columnas[estado].appendChild(crearTarjeta(t)));
    columnas[estado].parentElement.querySelector('.contador').textContent = tareasCol.length;
  }

  renderizarListaTareas();
}

function renderizarListaTareas() {
  const cont = document.getElementById('lista-tareas');
  if (!cont || vistaActual !== 'lista') return;
  const lista = tareasFiltradas();
  if (lista.length === 0) {
    cont.innerHTML = '<div class="lista-vacia">No hay tareas para mostrar.</div>';
    return;
  }
  cont.innerHTML = `
    <div class="lista-fila lista-encabezado">
      <span>Tarea</span>
      <span>Estado</span>
      <span>Prioridad</span>
      <span>Asignado</span>
      <span>Limite</span>
      <span>Tiempo</span>
      <span>Acciones</span>
    </div>
    ${lista.map(t => `
      <div class="lista-fila">
        <span class="lista-titulo">${t.titulo}</span>
        <span>${t.estado || 'pendiente'}</span>
        <span><span class="badge-prioridad ${t.prioridad || 'media'}">${t.prioridad || 'media'}</span></span>
        <span>${textoAsignado(t)}</span>
        <span>${t.fechaLimite || '-'}</span>
        <span>${formatearTiempo(segundosRegistrados(t))}</span>
        <span class="lista-acciones">
          ${puedeEditarTarea(t) ? `<button class="btn-editar" onclick="window.editarTarea('${t.id}')">Editar</button>` : ''}
          ${esAdmin() ? `<button class="btn-eliminar" onclick="window.eliminarTarea('${t.id}')">Eliminar</button>` : ''}
        </span>
      </div>
    `).join('')}
  `;
}

function crearTarjeta(tarea) {
  const div = document.createElement('div');
  div.className = `tarjeta ${tarea.prioridad || 'media'}`;
  div.dataset.id = tarea.id;
  div.draggable = puedeMoverTarea(tarea);
  div.ondragstart = (e) => e.dataTransfer.setData('id', tarea.id);

  if (!div.draggable) {
    div.classList.add('bloqueada');
  }

  const puedeGestionarTarea = puedeEditarTarea(tarea);
  const tiempoActivo = !!tarea.temporizadorActivo;
  const textoBotonTiempo = tiempoActivo ? 'Pausar' : 'Iniciar';
  const claseTiempo = tiempoActivo ? 'activo' : '';

  div.innerHTML = `
    <div class="tarjeta-encabezado">
      <h3>${tarea.titulo}</h3>
      <span class="badge-prioridad ${tarea.prioridad || 'media'}">${tarea.prioridad || 'media'}</span>
    </div>
    <p>${(tarea.descripcion || '').substring(0, 100)}</p>
    <div class="tarjeta-meta">
      <span>${textoAsignado(tarea)}</span>
      ${tarea.fechaLimite ? `<span>Limite: ${tarea.fechaLimite}</span>` : ''}
      ${tarea.sprintId ? `<span class="badge-sprint">${sprints.find(s => s.id === tarea.sprintId)?.nombre || ''}</span>` : ''}
      ${tarea.etiquetas && tarea.etiquetas.length > 0 ? `
    <div class="tarjeta-etiquetas">
      ${tarea.etiquetas.map(eid => {
        const et = etiquetas.find(e => e.id === eid);
        return et ? `<span class="etiqueta-dot" style="background:${et.color}" title="${et.nombre}"></span>` : '';
      }).join('')}
    </div>` : ''}
      </div>
    <div class="tarjeta-extra tarjeta-adjuntos" onclick="window.abrirAdjuntosTarea('${tarea.id}')">
      <span class="extra-icono">A</span>
      <span class="extra-badge adjuntos">ADJUNTOS</span>
      <span class="extra-texto">clic para ver/subir archivos</span>
    </div>
    <div class="tarjeta-extra tarjeta-tiempo ${claseTiempo}">
      <span class="extra-icono">T</span>
      <span class="extra-badge tiempo">TIEMPO</span>
      <span class="tiempo-valor">${formatearTiempo(segundosRegistrados(tarea))}</span>
      ${puedeGestionarTarea ? `<button type="button" class="btn-tiempo" onclick="window.toggleTiempoTarea('${tarea.id}')">${textoBotonTiempo}</button>` : ''}
    </div>
    <div class="tarjeta-acciones">
      ${puedeGestionarTarea ? `<button class="btn-editar" onclick="window.editarTarea('${tarea.id}')">Editar</button>` : ''}
      ${esAdmin() ? `<button class="btn-eliminar" onclick="window.eliminarTarea('${tarea.id}')">Eliminar</button>` : ''}
    </div>
  `;

  return div;
}

window.permitirSoltar = (e) => {
  e.preventDefault();
};

window.soltar = async (e) => {
  e.preventDefault();
  const id = e.dataTransfer.getData('id');
  const nuevoEstado = e.currentTarget.dataset.estado;
  const tarea = tareas.find(t => t.id === id);

  if (!tarea || !puedeMoverTarea(tarea)) {
    alert("No tienes permisos para mover esta tarea.");
    return;
  }

  await updateDoc(doc(db, "tareas", id), { estado: nuevoEstado });
};

window.abrirModalTarea = () => {
  if (!puedeCrearTareas()) {
    alert("No tienes permisos para crear tareas.");
    return;
  }
  etiquetasSeleccionadas = [];
  renderizarSelectorEtiquetas();
  tareaEditandoId = null;
  subtareasTemp = [];
  document.getElementById('modal-titulo').textContent = 'Nueva tarea';
  document.getElementById('inp-titulo').value = '';
  document.getElementById('inp-descripcion').value = '';
  document.getElementById('inp-fecha').value = '';
  document.getElementById('inp-prioridad').value = 'media';
  document.getElementById('inp-asignado').value = '';
  document.getElementById('inp-notas').value = '';
  document.getElementById('subtareas-container').innerHTML = '';
  aplicarPermisosModal(null);
  document.getElementById('modal-tarea').classList.remove('oculto');
};

window.cerrarModal = () => {
  if (unsubComentarios) { unsubComentarios(); unsubComentarios = null; }
  if (unsubSubtareas) { unsubSubtareas(); unsubSubtareas = null; }
  if (unsubAdjuntos) { unsubAdjuntos(); unsubAdjuntos = null; }
  document.getElementById('modal-tarea').classList.add('oculto');
  document.getElementById('seccion-comentarios').classList.add('oculto');
  document.getElementById('seccion-adjuntos').classList.add('oculto');
  document.getElementById('lista-comentarios').innerHTML = '';
  document.getElementById('lista-adjuntos').innerHTML = '';
  document.getElementById('subtareas-container').innerHTML = '';
};

function aplicarPermisosModal(tarea) {
  const gestion = puedeEditarCamposGestion();
  const esEdicionPropiaMiembro = tarea && miRol === 'miembro' && tareaEsPropia(tarea);

  document.getElementById('inp-asignado').disabled = !gestion;
  document.getElementById('inp-prioridad').disabled = !gestion;
  document.getElementById('inp-fecha').disabled = !gestion;

  document.getElementById('inp-titulo').disabled = !(gestion || esEdicionPropiaMiembro || !tarea);
  document.getElementById('inp-descripcion').disabled = !(gestion || esEdicionPropiaMiembro || !tarea);
  document.getElementById('inp-notas').disabled = !(gestion || esEdicionPropiaMiembro || !tarea);
}

window.guardarTarea = async () => {
  const titulo = document.getElementById('inp-titulo').value.trim();
  if (!titulo) {
    alert('El titulo es obligatorio');
    return;
  }

  const tareaActual = tareaEditandoId ? tareas.find(t => t.id === tareaEditandoId) : null;

  if (tareaActual && !puedeEditarTarea(tareaActual)) {
    alert("No tienes permisos para editar esta tarea.");
    return;
  }

  const usuarioAsignado = usuarioPorUid(document.getElementById('inp-asignado').value);

  let datos;
  if (tareaActual && miRol === 'miembro') {
    datos = {
      titulo,
      descripcion: document.getElementById('inp-descripcion').value,
      notas: document.getElementById('inp-notas').value,
      subtareas: [...subtareasTemp],
      estado: tareaActual.estado
    };
  } else {
    datos = {
      titulo,
      descripcion: document.getElementById('inp-descripcion').value,
      fechaLimite: document.getElementById('inp-fecha').value,
      prioridad: document.getElementById('inp-prioridad').value,
      asignadoUid: usuarioAsignado ? usuarioAsignado.id : '',
      asignadoEmail: usuarioAsignado ? usuarioAsignado.email : '',
      asignado: usuarioAsignado ? usuarioAsignado.email : '',
      notas: document.getElementById('inp-notas').value,
      subtareas: [...subtareasTemp],
      estado: tareaActual ? tareaActual.estado : 'pendiente',
      tableroId: tableroActualId,
      sprintId: document.getElementById('inp-sprint')?.value || '',
      etiquetas: [...etiquetasSeleccionadas],
      creadoPorUid: tareaActual ? tareaActual.creadoPorUid : usuarioActual.uid,
      creadoPorEmail: tareaActual ? tareaActual.creadoPorEmail : usuarioActual.email,
      fechaCreacion: tareaActual ? tareaActual.fechaCreacion : serverTimestamp()
    };
  }

  try {
    if (tareaEditandoId) {
      await updateDoc(doc(db, "tareas", tareaEditandoId), datos);
    } else {
      await addDoc(collection(db, "tareas"), datos);
    }

    // Notificar al usuario asignado si es diferente al actual
    if (usuarioAsignado && usuarioAsignado.id !== usuarioActual.uid) {
      await crearNotificacion(
        usuarioAsignado.id,
        'tarea_asignada',
        tareaEditandoId || 'nueva',
        `Te asignaron la tarea: ${titulo}`
      );
    }

    cerrarModal();
  } catch (error) {
    console.error("Error al guardar:", error);
    alert("Error al guardar: " + error.message);
  }
};

window.editarTarea = async (id) => {
  const tarea = tareas.find(x => x.id === id);
  if (!tarea || !puedeEditarTarea(tarea)) {
    alert("No tienes permisos para editar esta tarea.");
    return;
  }

  tareaEditandoId = id;
  subtareasTemp = tarea.subtareas ? [...tarea.subtareas] : [];
  document.getElementById('modal-titulo').textContent = 'Editar tarea';
  document.getElementById('inp-titulo').value = tarea.titulo || '';
  document.getElementById('inp-descripcion').value = tarea.descripcion || '';
  document.getElementById('inp-fecha').value = tarea.fechaLimite || '';
  document.getElementById('inp-prioridad').value = tarea.prioridad || 'media';
  document.getElementById('inp-asignado').value = tarea.asignadoUid || '';
  document.getElementById('inp-notas').value = tarea.notas || '';
  aplicarPermisosModal(tarea);
  renderSubtareas();
  etiquetasSeleccionadas = tarea.etiquetas ? [...tarea.etiquetas] : [];
  renderizarSelectorEtiquetas();
  document.getElementById('seccion-comentarios').classList.remove('oculto');
  document.getElementById('seccion-adjuntos').classList.remove('oculto');
  cargarComentarios(id);
  cargarSubtareas(id);
  cargarAdjuntos(id);
  document.getElementById('inp-sprint').value = tarea.sprintId || '';
  document.getElementById('modal-tarea').classList.remove('oculto');
};

window.eliminarTarea = async (id) => {
  if (!esAdmin()) return;
  if (!confirm('Eliminar tarea?')) return;
  await deleteDoc(doc(db, "tareas", id));
};

window.agregarSubtarea = async () => {
  const input = document.getElementById('inp-subtarea');
  if (!input.value.trim()) return;

  if (tareaEditandoId) {
    // Tarea existente â€” guardar directo en subcolecciÃ³n
    await agregarSubtarea(tareaEditandoId, input.value.trim(), subtareasTemp.length);
  } else {
    // Tarea nueva â€” guardar en array temporal como antes
    subtareasTemp.push({ texto: input.value.trim(), completada: false });
    renderSubtareas();
  }
  input.value = '';
};

function renderSubtareas() {
  const cont = document.getElementById('subtareas-container');
  cont.innerHTML = subtareasTemp.map((s, i) => `
    <div class="subtarea-item ${s.completada ? 'completada' : ''}">
      <input type="checkbox" ${s.completada ? 'checked' : ''} onchange="window.toggleSubtarea(${i})">
      <span>${s.texto}</span>
      <button type="button" onclick="window.quitarSubtarea(${i})">x</button>
    </div>
  `).join('');
}

window.toggleSubtarea = async (id, completada) => {
  if (tareaEditandoId) {
    await toggleSubtarea(tareaEditandoId, id, !completada);
  } else {
    const i = subtareasTemp.findIndex(s => s.id === id);
    if (i >= 0) { subtareasTemp[i].completada = !completada; renderSubtareas(); }
  }
};

window.quitarSubtarea = async (id) => {
  if (tareaEditandoId) {
    await eliminarSubtarea(tareaEditandoId, id);
  } else {
    subtareasTemp = subtareasTemp.filter(s => s.id !== id);
    renderSubtareas();
  }
};

window.filtrarTareas = () => {
  renderizar();
};

function cargarComentarios(tareaId) {
  if (unsubComentarios) unsubComentarios();

  unsubComentarios = escucharComentarios(tareaId, (comentarios) => {
    const lista = document.getElementById('lista-comentarios');
    if (comentarios.length === 0) {
      lista.innerHTML = '<p class="sin-comentarios">Sin comentarios aun.</p>';
      return;
    }
    lista.innerHTML = comentarios.map(c => `
      <div class="comentario-item">
        <div class="comentario-autor">${c.autorNombre}</div>
        <div class="comentario-texto">${c.texto}</div>
        <div class="comentario-fecha">${c.fechaCreacion?.toDate
          ? c.fechaCreacion.toDate().toLocaleString('es-PE')
          : ''}</div>
        ${esAdmin() ? `<button onclick="window.eliminarComentarioUI('${c.id}')">x</button>` : ''}
      </div>
    `).join('');
  });
}

window.enviarComentario = async () => {
  const texto = document.getElementById('inp-comentario').value.trim();
  if (!texto || !tareaEditandoId) return;
  await agregarComentario(tareaEditandoId, texto, usuarioActual);
  await registrarActividad(tableroActualId, usuarioActual, ACCIONES.COMENTARIO,
    `Comentario en tarea`, tareaEditandoId);
  document.getElementById('inp-comentario').value = '';
};

window.eliminarComentarioUI = async (comentarioId) => {
  if (!esAdmin()) return;
  const { eliminarComentario } = await import('./comentarios.js');
  await eliminarComentario(tareaEditandoId, comentarioId);
};

function cargarSubtareas(tareaId) {
  if (unsubSubtareas) unsubSubtareas();
  unsubSubtareas = escucharSubtareas(tareaId, (subtareas) => {
    const cont = document.getElementById('subtareas-container');
    if (subtareas.length === 0) {
      cont.innerHTML = '<p style="color:#999;font-size:13px;">Sin subtareas aun.</p>';
      return;
    }
    cont.innerHTML = subtareas.map(s => `
      <div class="subtarea-item ${s.completada ? 'completada' : ''}">
        <input type="checkbox" ${s.completada ? 'checked' : ''}
          onchange="window.toggleSubtarea('${s.id}', ${s.completada})">
        <span>${s.texto}</span>
        <button type="button" onclick="window.quitarSubtarea('${s.id}')">x</button>
      </div>
    `).join('');
  });
}

function cargarAdjuntos(tareaId) {
  if (unsubAdjuntos) unsubAdjuntos();
  unsubAdjuntos = escucharAdjuntos(tareaId, (adjuntos) => {
    const lista = document.getElementById('lista-adjuntos');
    if (!lista) return;
    if (adjuntos.length === 0) {
      lista.innerHTML = '<p class="sin-adjuntos">Sin adjuntos aun.</p>';
      return;
    }
    const tarea = tareas.find(t => t.id === tareaId);
    lista.innerHTML = adjuntos.map(a => `
      <div class="adjunto-item">
        <a href="${a.url}" target="_blank" rel="noopener">${a.nombre}</a>
        <span>${a.subidoPorEmail || ''}</span>
        ${tarea && puedeEditarTarea(tarea) ? `<button type="button" onclick="window.borrarAdjunto('${a.id}')">x</button>` : ''}
      </div>
    `).join('');
  });
}

window.abrirAdjuntosTarea = (tareaId) => {
  window.editarTarea(tareaId);
};

window.guardarAdjunto = async () => {
  if (!tareaEditandoId) return;
  const nombreInput = document.getElementById('inp-adjunto-nombre');
  const urlInput = document.getElementById('inp-adjunto-url');
  const nombre = nombreInput.value.trim();
  const url = urlInput.value.trim();

  if (!nombre || !url) {
    alert("Ingresa nombre y URL del adjunto.");
    return;
  }

  try {
    new URL(url);
  } catch {
    alert("La URL del adjunto no es valida.");
    return;
  }

  await agregarAdjunto(tareaEditandoId, {
    nombre,
    url,
    mimeType: '',
    tamanoBytes: 0
  }, usuarioActual);
  await registrarActividad(tableroActualId, usuarioActual, ACCIONES.TAREA_EDITADA,
    `Adjunto agregado: ${nombre}`, tareaEditandoId);
  nombreInput.value = '';
  urlInput.value = '';
};

window.borrarAdjunto = async (adjuntoId) => {
  if (!tareaEditandoId) return;
  if (!confirm("Eliminar este adjunto?")) return;
  await eliminarAdjunto(tareaEditandoId, adjuntoId);
  await registrarActividad(tableroActualId, usuarioActual, ACCIONES.TAREA_EDITADA,
    'Adjunto eliminado', tareaEditandoId);
};

function iniciarRefrescoTiempo() {
  if (renderTiempoInterval) return;
  renderTiempoInterval = setInterval(() => {
    if (tareas.some(t => t.temporizadorActivo)) {
      renderizar();
    }
  }, 1000);
}

window.toggleTiempoTarea = async (tareaId) => {
  const tarea = tareas.find(t => t.id === tareaId);
  if (!tarea || !puedeEditarTarea(tarea)) {
    alert("No tienes permisos para registrar tiempo en esta tarea.");
    return;
  }

  if (tarea.temporizadorActivo) {
    const inicio = fechaFirestoreAdate(tarea.temporizadorInicio);
    const transcurrido = inicio ? Math.max(0, Math.floor((Date.now() - inicio.getTime()) / 1000)) : 0;
    const total = Number(tarea.tiempoTotalSegundos || 0) + transcurrido;
    await updateDoc(doc(db, "tareas", tareaId), {
      tiempoTotalSegundos: total,
      temporizadorActivo: false,
      temporizadorInicio: null,
      temporizadorUsuarioId: ''
    });
    await registrarActividad(tableroActualId, usuarioActual, ACCIONES.TAREA_EDITADA,
      `Tiempo pausado: ${formatearTiempo(total)}`, tareaId);
    return;
  }

  await updateDoc(doc(db, "tareas", tareaId), {
    temporizadorActivo: true,
    temporizadorInicio: new Date(),
    temporizadorUsuarioId: usuarioActual.uid
  });
  await registrarActividad(tableroActualId, usuarioActual, ACCIONES.TAREA_EDITADA,
    'Tiempo iniciado', tareaId);
};

window.abrirModalSprints = () => {
  if (!esAdmin() && !esLider()) {
    alert("Solo administrador o lÃ­der pueden gestionar sprints.");
    return;
  }
  document.getElementById('modal-sprints').classList.remove('oculto');
};

window.cerrarModalSprints = () => {
  document.getElementById('modal-sprints').classList.add('oculto');
  document.getElementById('inp-sprint-nombre').value = '';
  document.getElementById('inp-sprint-inicio').value = '';
  document.getElementById('inp-sprint-fin').value = '';
};

window.guardarSprint = async () => {
  const nombre = document.getElementById('inp-sprint-nombre').value.trim();
  const inicio = document.getElementById('inp-sprint-inicio').value;
  const fin = document.getElementById('inp-sprint-fin').value;

  if (!nombre || !inicio || !fin) {
    alert("Completa todos los campos del sprint.");
    return;
  }

  await crearSprint(tableroActualId, { nombre, fechaInicio: inicio, fechaFin: fin });
  await registrarActividad(tableroActualId, usuarioActual, ACCIONES.TAREA_CREADA,
    `Sprint creado: ${nombre}`);
  cerrarModalSprints();
};

function cargarSprints() {
  if (unsubSprints) unsubSprints();
  unsubSprints = escucharSprints(tableroActualId, (listaSprints) => {
    sprints = listaSprints;
    actualizarSelectSprints();
    renderizarListaSprints();
  });
}

function actualizarSelectSprints() {
  const select = document.getElementById('inp-sprint');
  if (!select) return;
  const valorActual = select.value;
  select.innerHTML = '<option value="">-- Sin sprint --</option>' +
    sprints.map(s => `<option value="${s.id}">${s.nombre} (${s.estado})</option>`).join('');
  select.value = valorActual;
}

function renderizarListaSprints() {
  const lista = document.getElementById('lista-sprints');
  if (!lista) return;
  if (sprints.length === 0) {
    lista.innerHTML = '<p style="color:#999;font-size:13px;">No hay sprints creados aÃºn.</p>';
    return;
  }
  lista.innerHTML = sprints.map(s => `
    <div class="sprint-item">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <strong>${s.nombre}</strong>
        <span class="badge-sprint">${s.estado}</span>
      </div>
      <span style="font-size:12px;color:#999">${s.fechaInicio} â†’ ${s.fechaFin}</span>
      <div style="display:flex;gap:6px;margin-top:6px">
        <button class="mock-btn" onclick="window.cambiarEstadoSprint('${s.id}', 'activo')">Activar</button>
        <button class="mock-btn" onclick="window.cambiarEstadoSprint('${s.id}', 'cerrado')">Cerrar</button>
        <button class="mock-btn" style="color:red;border-color:red" onclick="window.borrarSprint('${s.id}', '${s.nombre}')">Eliminar</button>
      </div>
    </div>
  `).join('');
}

window.borrarSprint = async (sprintId, nombre) => {
  if (!confirm(`Â¿Eliminar el sprint "${nombre}"?`)) return;
  await eliminarSprint(sprintId);
};

window.cambiarEstadoSprint = async (sprintId, estado) => {
  await actualizarEstadoSprint(sprintId, estado);
};

window.abrirModalEtiquetas = () => {
  if (!esAdmin() && !esLider()) {
    alert("Solo administrador o lÃ­der pueden gestionar etiquetas.");
    return;
  }
  document.getElementById('modal-etiquetas').classList.remove('oculto');
};

window.cerrarModalEtiquetas = () => {
  document.getElementById('modal-etiquetas').classList.add('oculto');
  document.getElementById('inp-etiqueta-nombre').value = '';
};

window.guardarEtiqueta = async () => {
  const nombre = document.getElementById('inp-etiqueta-nombre').value.trim();
  const color = document.getElementById('inp-etiqueta-color').value;
  if (!nombre) {
    alert("El nombre es obligatorio.");
    return;
  }
  await crearEtiqueta(tableroActualId, nombre, color);
  document.getElementById('inp-etiqueta-nombre').value = '';
};

window.borrarEtiqueta = async (etiquetaId, nombre) => {
  if (!confirm(`Â¿Eliminar la etiqueta "${nombre}"?`)) return;
  await eliminarEtiqueta(etiquetaId);
};

function cargarEtiquetas() {
  if (unsubEtiquetas) unsubEtiquetas();
  unsubEtiquetas = escucharEtiquetas(tableroActualId, (lista) => {
    etiquetas = lista;
    renderizarListaEtiquetas();
    renderizarSelectorEtiquetas();
  });
}

function renderizarListaEtiquetas() {
  const lista = document.getElementById('lista-etiquetas');
  if (!lista) return;
  if (etiquetas.length === 0) {
    lista.innerHTML = '<p style="color:#999;font-size:13px;">No hay etiquetas creadas aÃºn.</p>';
    return;
  }
  lista.innerHTML = etiquetas.map(e => `
    <div class="etiqueta-item">
      <span class="etiqueta-dot" style="background:${e.color}"></span>
      <span>${e.nombre}</span>
      <button class="mock-btn" style="color:red;border-color:red;margin-left:auto"
        onclick="window.borrarEtiqueta('${e.id}', '${e.nombre}')">Eliminar</button>
    </div>
  `).join('');
}

function renderizarSelectorEtiquetas() {
  const cont = document.getElementById('inp-etiquetas-container');
  if (!cont) return;
  cont.innerHTML = etiquetas.map(e => `
    <label class="etiqueta-check">
      <input type="checkbox" value="${e.id}"
        ${etiquetasSeleccionadas.includes(e.id) ? 'checked' : ''}
        onchange="window.toggleEtiqueta('${e.id}')">
      <span class="etiqueta-dot" style="background:${e.color}"></span>
      ${e.nombre}
    </label>
  `).join('');
}

window.toggleEtiqueta = (etiquetaId) => {
  if (etiquetasSeleccionadas.includes(etiquetaId)) {
    etiquetasSeleccionadas = etiquetasSeleccionadas.filter(id => id !== etiquetaId);
  } else {
    etiquetasSeleccionadas.push(etiquetaId);
  }
};

function cargarNotificaciones() {
  if (unsubNotificaciones) unsubNotificaciones();
  unsubNotificaciones = escucharNotificaciones(usuarioActual.uid, (lista) => {
    notificaciones = lista;
    renderizarNotificaciones();
  });
}

function renderizarNotificaciones() {
  const badge = document.getElementById('notif-badge');
  const lista = document.getElementById('notif-lista');
  const noLeidas = notificaciones.filter(n => !n.leida).length;

  if (noLeidas > 0) {
    badge.textContent = noLeidas;
    badge.classList.remove('oculto');
  } else {
    badge.classList.add('oculto');
  }

  if (notificaciones.length === 0) {
    lista.innerHTML = '<p class="sin-notif">Sin notificaciones.</p>';
    return;
  }

  lista.innerHTML = notificaciones.map(n => `
    <div class="notif-item ${n.leida ? 'leida' : ''}" onclick="window.leerNotif('${n.id}')">
      <span class="notif-msg">${n.mensaje}</span>
      <span class="notif-fecha">${n.fechaCreacion?.toDate
        ? n.fechaCreacion.toDate().toLocaleString('es-PE')
        : ''}</span>
    </div>
  `).join('');
}

window.toggleNotificaciones = () => {
  document.getElementById('notif-dropdown').classList.toggle('oculto');
};

window.leerNotif = async (notifId) => {
  await marcarLeida(notifId);
};

window.marcarTodasLeidas = async () => {
  const { marcarLeida } = await import('./notificaciones.js');
  const noLeidas = notificaciones.filter(n => !n.leida);
  for (const n of noLeidas) {
    await marcarLeida(n.id);
  }
};

window.abrirModalInvitaciones = () => {
  if (!esAdmin() && !esLider()) {
    alert("Solo administrador o lÃ­der pueden gestionar invitaciones.");
    return;
  }
  cargarInvitaciones();
  document.getElementById('modal-invitaciones').classList.remove('oculto');
};

window.cerrarModalInvitaciones = () => {
  document.getElementById('modal-invitaciones').classList.add('oculto');
  document.getElementById('inp-invitacion-email').value = '';
};

window.enviarInvitacion = async () => {
  const email = document.getElementById('inp-invitacion-email').value.trim();
  if (!email) {
    alert("Ingresa un correo.");
    return;
  }
  if (!email.endsWith('@kg.com.pe')) {
    alert("Solo se permiten correos corporativos @kg.com.pe");
    return;
  }
  try {
    await crearInvitacion(tableroActualId, email, usuarioActual.uid);
    await crearNotificacion(
      usuarioActual.uid,
      'invitacion_enviada',
      tableroActualId,
      `InvitaciÃ³n enviada a ${email}`
    );
    document.getElementById('inp-invitacion-email').value = '';
    alert("InvitaciÃ³n enviada correctamente.");
  } catch (error) {
    alert(error.message);
  }
};

function cargarInvitaciones() {
  if (unsubInvitaciones) unsubInvitaciones();
  const q = query(
    collection(db, "invitaciones"),
    where("tableroId", "==", tableroActualId)
  );
  unsubInvitaciones = onSnapshot(q, (snapshot) => {
    const invitaciones = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderizarListaInvitaciones(invitaciones);
  });
}

function renderizarListaInvitaciones(invitaciones) {
  const lista = document.getElementById('lista-invitaciones');
  if (!lista) return;
  if (invitaciones.length === 0) {
    lista.innerHTML = '<p style="color:#999;font-size:13px;">No hay invitaciones enviadas.</p>';
    return;
  }
  lista.innerHTML = invitaciones.map(inv => `
    <div class="invitacion-item">
      <div style="flex:1">
        <span style="font-size:13px;font-weight:500">${inv.email}</span>
        <span class="invitacion-badge ${inv.estado}">${inv.estado}</span>
      </div>
      ${esAdmin() ? `<button class="mock-btn" style="color:red;border-color:red"
        onclick="window.borrarInvitacion('${inv.id}')">Eliminar</button>` : ''}
    </div>
  `).join('');
}

window.borrarInvitacion = async (invId) => {
  if (!confirm("Â¿Eliminar esta invitaciÃ³n?")) return;
  await eliminarInvitacion(invId);
  cargarInvitaciones();
};

window.abrirConfig = async () => {
  document.getElementById('cfg-tema-oscuro').checked = temaOscuroUsuario;

  const seccionTablero = document.getElementById('seccion-config-tablero');
  if (seccionTablero) {
    seccionTablero.style.display = (esAdmin() || esLider()) ? 'block' : 'none';
  }

  if (esAdmin() || esLider()) {
    const config = await obtenerConfig(tableroActualId);
    document.getElementById('cfg-vista').value = config.vistaDefault || 'kanban';
    document.getElementById('cfg-notif-email').checked = config.notifEmail || false;
  }

  document.getElementById('modal-config').classList.remove('oculto');
};

window.cerrarConfig = () => {
  document.getElementById('modal-config').classList.add('oculto');
};

window.guardarConfig = async () => {
  const temaOscuro = document.getElementById('cfg-tema-oscuro').checked;
  await updateDoc(doc(db, "usuarios", usuarioActual.uid), { temaOscuro });
  aplicarTemaOscuro(temaOscuro);

  if (esAdmin() || esLider()) {
    const config = {
      vistaDefault: document.getElementById('cfg-vista').value,
      notifEmail: document.getElementById('cfg-notif-email').checked
    };
    await guardarConfigFirestore(tableroActualId, config);
    vistaActual = config.vistaDefault;
    renderizar();
    await registrarActividad(tableroActualId, usuarioActual, ACCIONES.TAREA_EDITADA,
      'Configuracion del tablero actualizada');
  }

  cerrarConfig();
  alert("Ajustes guardados.");
};
