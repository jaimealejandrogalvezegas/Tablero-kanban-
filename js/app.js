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
import { escucharActividad, registrarActividad, ACCIONES } from './actividad.js';
import { agregarSubtarea, escucharSubtareas, toggleSubtarea, eliminarSubtarea } from './subtareas.js';
import { crearSprint, escucharSprints, actualizarEstadoSprint, actualizarSprint, eliminarSprint } from './sprints.js';
import { crearEtiqueta, escucharEtiquetas, eliminarEtiqueta } from './etiquetas.js';
import { escucharNotificaciones, marcarLeida, crearNotificacion } from './notificaciones.js';
import { crearInvitacion, escucharInvitaciones, aceptarInvitacion, rechazarInvitacion, eliminarInvitacion } from './invitaciones.js';
import { obtenerConfig, guardarConfig as guardarConfigFirestore } from './config.js';
import { escucharAdjuntos, agregarAdjunto, eliminarAdjunto } from './adjuntos.js';
import { escucharProyectos, crearProyecto, actualizarProyecto, cambiarEstadoProyecto, eliminarProyecto } from './proyectos.js';

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
let invitaciones = [];
let renderTiempoInterval = null;
let temaOscuroUsuario = false;
let vistaActual = 'kanban';
let proyectoActivoId = null;
let proyectos = [];
let unsubProyectos = null;
let proyectoEditandoId = null;
let sprintEditandoId = null;
let actividad = [];
let unsubActividad = null;
const subtareasPorTarea = new Map();

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
  return rolesQueCrean.includes(miRol) && !proyectoEstaCerrado();
}

function proyectoActivo() {
  return proyectoActivoId ? proyectos.find(p => p.id === proyectoActivoId) : null;
}

function proyectoEstaCerrado(proyecto = proyectoActivo()) {
  return !!proyecto && ['cerrado', 'finalizado', 'cancelado'].includes(String(proyecto.estado || '').toLowerCase());
}

function proyectoDeTarea(tarea) {
  return tarea?.proyectoId ? proyectos.find(p => p.id === tarea.proyectoId) : null;
}

function tareaEnProyectoCerrado(tarea) {
  return proyectoEstaCerrado(proyectoDeTarea(tarea));
}

function tareaEsPropia(tarea) {
  return tarea.asignadoUid === usuarioActual.uid ||
    tarea.asignadoEmail === usuarioActual.email ||
    tarea.asignado === usuarioActual.email ||
    tarea.creadoPorUid === usuarioActual.uid ||
    (tarea.colaboradoresUids || []).includes(usuarioActual.uid);
}

function puedeEditarTarea(tarea) {
  if (tareaEnProyectoCerrado(tarea)) return false;
  return esAdmin() || esLider() || (miRol === 'miembro' && tareaEsPropia(tarea));
}

function puedeMoverTarea(tarea) {
  if (tareaEnProyectoCerrado(tarea)) return false;
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

function usuariosPorUids(uids = []) {
  return uids.map(uid => usuarioPorUid(uid)).filter(Boolean);
}

function valoresSelectMultiple(id) {
  const select = document.getElementById(id);
  return select ? Array.from(select.selectedOptions).map(op => op.value).filter(Boolean) : [];
}

function seleccionarMultiple(id, valores = []) {
  const select = document.getElementById(id);
  if (!select) return;
  const set = new Set(valores || []);
  Array.from(select.options).forEach(op => {
    op.selected = set.has(op.value);
  });
}

function textoAsignado(tarea) {
  const usuario = usuarioPorUid(tarea.asignadoUid) || usuarioPorEmail(tarea.asignadoEmail || tarea.asignado);
  return usuario ? nombreUsuario(usuario) : (tarea.asignadoEmail || tarea.asignado || 'Sin asignar');
}

function textoColaboradores(tarea) {
  const nombres = usuariosPorUids(tarea.colaboradoresUids || []).map(nombreUsuario);
  return nombres.length ? nombres.join(', ') : '';
}

async function notificarUsuario(usuarioId, tipo, referenciaId, mensaje) {
  if (!usuarioId || usuarioId === usuarioActual.uid) return;
  try {
    await crearNotificacion(usuarioId, tipo, referenciaId, mensaje);
  } catch (errorNotif) {
    console.warn("No se pudo crear la notificacion:", errorNotif);
  }
}

async function registrarCambiosAsignacion(tareaAnterior, tareaId, titulo, usuarioAsignado, colaboradoresUids) {
  const asignadoAnterior = tareaAnterior?.asignadoUid || '';
  const asignadoNuevo = usuarioAsignado?.id || '';
  const colaboradoresAnteriores = new Set(tareaAnterior?.colaboradoresUids || []);
  const colaboradoresNuevos = new Set(colaboradoresUids || []);

  if (asignadoNuevo && asignadoNuevo !== asignadoAnterior) {
    await notificarUsuario(asignadoNuevo, 'tarea_asignada', tareaId, `Te asignaron la tarea: ${titulo}`);
    await registrarActividad(tableroActualId, usuarioActual, ACCIONES.TAREA_EDITADA,
      `Tarea "${titulo}" asignada a ${usuarioAsignado.email}`, tareaId);
  }

  for (const uid of colaboradoresNuevos) {
    if (!colaboradoresAnteriores.has(uid)) {
      const colaborador = usuarioPorUid(uid);
      await notificarUsuario(uid, 'colaborador_tarea', tareaId, `Te agregaron como colaborador en: ${titulo}`);
      await registrarActividad(tableroActualId, usuarioActual, ACCIONES.TAREA_EDITADA,
        `Colaborador agregado a "${titulo}": ${colaborador?.email || uid}`, tareaId);
    }
  }
}

function fechaFirestoreAdate(valor) {
  if (!valor) return null;
  if (valor.toDate) return valor.toDate();
  if (valor instanceof Date) return valor;
  return new Date(valor);
}

function fechaValida(valor) {
  if (!valor) return null;
  if (valor.toDate) return fechaValida(valor.toDate());
  if (valor instanceof Date) {
    return new Date(valor.getFullYear(), valor.getMonth(), valor.getDate());
  }
  const texto = String(valor).trim();
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }
  const local = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (local) {
    return new Date(Number(local[3]), Number(local[2]) - 1, Number(local[1]));
  }
  const fecha = new Date(texto);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function textoFecha(valor) {
  const fecha = fechaValida(valor);
  return fecha ? fecha.toLocaleDateString('es-PE') : 'sin fecha';
}

function fechaEsAnterior(fechaA, fechaB) {
  const a = fechaValida(fechaA);
  const b = fechaValida(fechaB);
  return !!(a && b && a < b);
}

function fechaFueraDeRango(fecha, inicio, fin) {
  const valor = fechaValida(fecha);
  const desde = fechaValida(inicio);
  const hasta = fechaValida(fin);
  if (!valor) return false;
  if (desde && valor < desde) return true;
  if (hasta && valor > hasta) return true;
  return false;
}

function horasEntreFechas(inicio, fin) {
  const desde = fechaValida(inicio);
  const hasta = fechaValida(fin);
  if (!desde || !hasta || hasta < desde) return 0;
  const dias = Math.floor((hasta - desde) / 86400000) + 1;
  return dias * 24;
}

function horasEstimadasTareas(lista) {
  return lista.reduce((total, tarea) => total + Number(tarea.tiempoEstimadoHoras || 0), 0);
}

function horasTareasSprint(sprintId, excluirTareaId = null) {
  return horasEstimadasTareas(tareas.filter(t => t.sprintId === sprintId && t.id !== excluirTareaId));
}

function horasTareasProyecto(proyectoId, excluirTareaId = null) {
  return horasEstimadasTareas(tareas.filter(t => t.proyectoId === proyectoId && t.id !== excluirTareaId));
}

function sprintsDelProyecto(proyectoId) {
  return sprints.filter(s => s.proyectoId === proyectoId);
}

function usuarioParticipaEnTarea(tarea, uid) {
  return tarea.asignadoUid === uid || (tarea.colaboradoresUids || []).includes(uid);
}

function horasUsuarioEnProyecto(uid, proyectoId, excluirTareaId = null) {
  return horasEstimadasTareas(tareas.filter(t =>
    t.proyectoId === proyectoId &&
    t.id !== excluirTareaId &&
    usuarioParticipaEnTarea(t, uid)
  ));
}

function subtareasDeTarea(tarea) {
  const desdeSubcoleccion = subtareasPorTarea.get(tarea.id);
  if (desdeSubcoleccion && desdeSubcoleccion.length > 0) return desdeSubcoleccion;
  return tarea.subtareas || [];
}

function progresoSubtareas(tarea) {
  const lista = subtareasDeTarea(tarea);
  const total = lista.length;
  const completadas = lista.filter(s => !!s.completada).length;
  return {
    total,
    completadas,
    pendientes: total - completadas,
    porcentaje: total ? Math.round((completadas / total) * 100) : 0
  };
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
  if (unsubActividad) unsubActividad();
  unsubActividad = null;
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

  const guardado = localStorage.getItem('proyectoActivo_' + tableroActualId);
  if (guardado) proyectoActivoId = guardado;

  cargarProyectos();
  cargarSprints();
  cargarEtiquetas();
  cargarNotificaciones();
  cargarActividad();
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
  actualizarEstadoProyectoActivo();

}

function actualizarEstadoProyectoActivo() {
  const aviso = document.getElementById('aviso-proyecto');
  const btnNuevaTarea = document.getElementById('btn-nueva-tarea');
  const btnSprints = document.getElementById('btn-sprints');
  const proyecto = proyectoActivo();
  const cerrado = proyectoEstaCerrado(proyecto);

  if (btnNuevaTarea) {
    btnNuevaTarea.disabled = cerrado;
    btnNuevaTarea.title = cerrado ? 'Proyecto cerrado: no se pueden crear tareas.' : '';
  }
  if (btnSprints) {
    btnSprints.disabled = cerrado;
    btnSprints.title = cerrado ? 'Proyecto cerrado: no se pueden crear sprints.' : '';
  }

  if (!aviso) return;
  if (!proyecto) {
    aviso.textContent = 'Selecciona o crea un proyecto para organizar sprints y tareas.';
    aviso.className = 'aviso-proyecto';
    return;
  }

  if (cerrado) {
    aviso.textContent = `Proyecto "${proyecto.nombre}" cerrado: modo consulta. No se pueden crear nuevas tareas ni sprints.`;
    aviso.className = 'aviso-proyecto cerrado';
    return;
  }

  aviso.textContent = `Proyecto activo: ${proyecto.nombre}`;
  aviso.className = 'aviso-proyecto activo';
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
  const sprintResponsable = document.getElementById('inp-sprint-responsable');
  const proyectoResponsable = document.getElementById('inp-proyecto-responsable');
  const colaboradores = document.getElementById('inp-colaboradores');
  const sprintParticipantes = document.getElementById('inp-sprint-participantes');
  const proyectoMiembros = document.getElementById('inp-proyecto-miembros');

  const opcionesUsuarios = usuarios.map(u => `<option value="${u.id}">${nombreUsuario(u)} (${u.email})</option>`).join('');

  filtroUsuario.innerHTML = '<option value="todos">Todos los usuarios</option>' + opcionesUsuarios;
  asignado.innerHTML = '<option value="">-- Sin asignar --</option>' + opcionesUsuarios;
  if (colaboradores) colaboradores.innerHTML = opcionesUsuarios;
  if (sprintParticipantes) sprintParticipantes.innerHTML = opcionesUsuarios;
  if (proyectoMiembros) proyectoMiembros.innerHTML = opcionesUsuarios;

  if (sprintResponsable) {
    const valor = sprintResponsable.value;
    sprintResponsable.innerHTML = '<option value="">-- Sin responsable --</option>' + opcionesUsuarios;
    sprintResponsable.value = valor;
  }

  if (proyectoResponsable) {
    const valor = proyectoResponsable.value;
    proyectoResponsable.innerHTML = '<option value="">-- Sin responsable --</option>' + opcionesUsuarios;
    proyectoResponsable.value = valor;
  }
}

function escucharTareas() {
  unsubTareas.forEach(unsub => unsub());
  unsubTareas = [];
  tareas = [];

  if (puedeVerTodo()) {
    let q = query(collection(db, "tareas"), orderBy("fechaCreacion", "desc"));
    if (proyectoActivoId) {
      q = query(collection(db, "tareas"), where("proyectoId", "==", proyectoActivoId), orderBy("fechaCreacion", "desc"));
    }
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
    if (proyectoActivoId) {
      tareas = tareas.filter(t => t.proyectoId === proyectoActivoId);
    }
    renderizar();
  };

  const consultas = [
    query(collection(db, "tareas"), where("asignadoUid", "==", usuarioActual.uid)),
    query(collection(db, "tareas"), where("asignadoEmail", "==", usuarioActual.email)),
    query(collection(db, "tareas"), where("asignado", "==", usuarioActual.email)),
    query(collection(db, "tareas"), where("colaboradoresUids", "array-contains", usuarioActual.uid))
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
  renderizarListaSprints();
  renderizarActividad();
  actualizarEstadoProyectoActivo();
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
      <span>Tipo</span>
      <span>Asignado</span>
      <span>Colaboradores</span>
      <span>Limite</span>
      <span>Estimado</span>
      <span>Subtareas</span>
      <span>Tiempo</span>
      <span>Acciones</span>
    </div>
    ${lista.map(t => `
      <div class="lista-fila">
        <span class="lista-titulo">${t.titulo}</span>
        <span>${t.estado || 'pendiente'}</span>
        <span><span class="badge-prioridad ${t.prioridad || 'media'}">${t.prioridad || 'media'}</span></span>
        <span>${t.tipo || 'tarea'}</span>
        <span>${textoAsignado(t)}</span>
        <span>${textoColaboradores(t) || '-'}</span>
        <span>${t.fechaLimite || '-'}</span>
        <span>${t.tiempoEstimadoHoras ? `${t.tiempoEstimadoHoras}h` : '-'}</span>
        <span>${progresoSubtareas(t).total ? `${progresoSubtareas(t).completadas}/${progresoSubtareas(t).total}` : '-'}</span>
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
  const progreso = progresoSubtareas(tarea);

  div.innerHTML = `
    <div class="tarjeta-encabezado">
      <h3>${tarea.titulo}</h3>
      <span class="badge-prioridad ${tarea.prioridad || 'media'}">${tarea.prioridad || 'media'}</span>
    </div>
    <p>${(tarea.descripcion || '').substring(0, 100)}</p>
    <div class="tarjeta-meta">
      <span>${textoAsignado(tarea)}</span>
      ${textoColaboradores(tarea) ? `<span>Colab: ${textoColaboradores(tarea)}</span>` : ''}
      ${tarea.fechaLimite ? `<span>Limite: ${tarea.fechaLimite}</span>` : ''}
      ${tarea.tipo ? `<span>${tarea.tipo}</span>` : ''}
      ${tarea.tiempoEstimadoHoras ? `<span>Est: ${tarea.tiempoEstimadoHoras}h</span>` : ''}
      ${tarea.sprintId ? `<span class="badge-sprint">${sprints.find(s => s.id === tarea.sprintId)?.nombre || ''}</span>` : ''}
      ${tarea.etiquetas && tarea.etiquetas.length > 0 ? `
    <div class="tarjeta-etiquetas">
      ${tarea.etiquetas.map(eid => {
        const et = etiquetas.find(e => e.id === eid);
        return et ? `<span class="etiqueta-dot" style="background:${et.color}" title="${et.nombre}"></span>` : '';
      }).join('')}
    </div>` : ''}
      </div>
    ${progreso.total ? `
      <div class="subtarea-progreso">
        <div class="subtarea-progreso-texto">
          <span>Subtareas</span>
          <strong>${progreso.completadas}/${progreso.total}</strong>
        </div>
        <div class="subtarea-barra"><span style="width:${progreso.porcentaje}%"></span></div>
      </div>` : ''}
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

  if (tarea.estado === nuevoEstado) return;

  const progreso = progresoSubtareas(tarea);
  if (nuevoEstado === 'terminado' && progreso.pendientes > 0) {
    const continuar = confirm(`Esta tarea tiene ${progreso.pendientes} subtarea(s) pendiente(s). ¿Deseas marcarla como terminada igual?`);
    if (!continuar) return;
  }

  await updateDoc(doc(db, "tareas", id), { estado: nuevoEstado });
  await registrarActividad(tableroActualId, usuarioActual, ACCIONES.TAREA_MOVIDA,
    `Tarea "${tarea.titulo}" movida de ${tarea.estado || 'sin estado'} a ${nuevoEstado}${progreso.pendientes > 0 ? ` con ${progreso.pendientes} subtarea(s) pendiente(s)` : ''}`, id);
};

window.abrirModalTarea = () => {
  if (!puedeCrearTareas()) {
    alert(proyectoEstaCerrado() ? "El proyecto esta cerrado. No se pueden crear tareas nuevas." : "No tienes permisos para crear tareas.");
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
  document.getElementById('inp-tipo').value = 'tarea';
  document.getElementById('inp-tiempo-estimado').value = '';
  document.getElementById('inp-asignado').value = '';
  seleccionarMultiple('inp-colaboradores', []);
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
  document.getElementById('inp-colaboradores').disabled = !gestion;
  document.getElementById('inp-prioridad').disabled = !gestion;
  document.getElementById('inp-fecha').disabled = !gestion;
  document.getElementById('inp-tipo').disabled = !gestion;
  document.getElementById('inp-tiempo-estimado').disabled = !gestion;

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

  if (!tareaActual && proyectoEstaCerrado()) {
    alert("El proyecto esta cerrado. No se pueden crear tareas nuevas.");
    return;
  }

  if (tareaActual && !puedeEditarTarea(tareaActual)) {
    alert("No tienes permisos para editar esta tarea.");
    return;
  }

  const usuarioAsignado = usuarioPorUid(document.getElementById('inp-asignado').value);
  const colaboradoresUids = valoresSelectMultiple('inp-colaboradores').filter(uid => uid !== usuarioAsignado?.id);
  const colaboradoresDatos = usuariosPorUids(colaboradoresUids);
  const fechaLimite = document.getElementById('inp-fecha').value;
  const sprintId = document.getElementById('inp-sprint')?.value || '';
  const sprintSeleccionado = sprintId ? sprints.find(s => s.id === sprintId) : null;
  const proyectoActivo = proyectoActivoId ? proyectos.find(p => p.id === proyectoActivoId) : null;
  const tiempoEstimadoHoras = Number(document.getElementById('inp-tiempo-estimado').value || 0);

  if (tiempoEstimadoHoras < 0) {
    alert("El tiempo estimado no puede ser negativo.");
    return;
  }

  if (tiempoEstimadoHoras > 0 && sprintSeleccionado) {
    const horasDisponiblesSprint = Number(sprintSeleccionado.capacidadHoras || 0) || horasEntreFechas(sprintSeleccionado.fechaInicio, sprintSeleccionado.fechaFin);
    const totalSprint = horasTareasSprint(sprintSeleccionado.id, tareaActual?.id) + tiempoEstimadoHoras;
    if (totalSprint > horasDisponiblesSprint) {
      alert(`La tarea excede la capacidad del sprint. Disponible: ${horasDisponiblesSprint}h, usado con esta tarea: ${totalSprint}h.`);
      return;
    }
  }

  if (tiempoEstimadoHoras > 0 && proyectoActivo) {
    const horasProyecto = Number(proyectoActivo.capacidadHoras || 0) || horasEntreFechas(proyectoActivo.fechaInicio, proyectoActivo.fechaFin);
    if (tiempoEstimadoHoras > horasProyecto) {
      alert(`La tarea supera la capacidad total del proyecto (${horasProyecto}h).`);
      return;
    }
    const totalProyecto = horasTareasProyecto(proyectoActivo.id, tareaActual?.id) + tiempoEstimadoHoras;
    if (Number(proyectoActivo.capacidadHoras || 0) > 0 && totalProyecto > Number(proyectoActivo.capacidadHoras)) {
      alert(`Las tareas exceden la capacidad del proyecto. Capacidad: ${proyectoActivo.capacidadHoras}h, usado con esta tarea: ${totalProyecto}h.`);
      return;
    }
  }

  const participantes = [usuarioAsignado?.id, ...colaboradoresUids].filter(Boolean);
  if (tiempoEstimadoHoras > 0 && proyectoActivo && participantes.length > 0) {
    const horasCalendarioProyecto = horasEntreFechas(proyectoActivo.fechaInicio, proyectoActivo.fechaFin);
    const sobrecargado = participantes.find(uid =>
      horasUsuarioEnProyecto(uid, proyectoActivo.id, tareaActual?.id) + tiempoEstimadoHoras > horasCalendarioProyecto
    );
    if (sobrecargado) {
      const usuario = usuarioPorUid(sobrecargado);
      alert(`${usuario ? nombreUsuario(usuario) : 'El usuario'} supera sus horas disponibles dentro del proyecto (${horasCalendarioProyecto}h).`);
      return;
    }
  }

  if (fechaLimite && sprintSeleccionado && fechaFueraDeRango(fechaLimite, sprintSeleccionado.fechaInicio, sprintSeleccionado.fechaFin)) {
    alert("La fecha limite de la tarea debe estar dentro de las fechas del sprint seleccionado.");
    return;
  }

  if (fechaLimite && !sprintSeleccionado && proyectoActivo && fechaFueraDeRango(fechaLimite, proyectoActivo.fechaInicio, proyectoActivo.fechaFin)) {
    alert("La fecha limite de la tarea debe estar dentro de las fechas del proyecto activo.");
    return;
  }

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
      fechaLimite,
      prioridad: document.getElementById('inp-prioridad').value,
      tipo: document.getElementById('inp-tipo').value,
      tiempoEstimadoHoras,
      asignadoUid: usuarioAsignado ? usuarioAsignado.id : '',
      asignadoEmail: usuarioAsignado ? usuarioAsignado.email : '',
      asignado: usuarioAsignado ? usuarioAsignado.email : '',
      colaboradoresUids,
      colaboradoresEmails: colaboradoresDatos.map(u => u.email),
      notas: document.getElementById('inp-notas').value,
      subtareas: [...subtareasTemp],
      estado: tareaActual ? tareaActual.estado : 'pendiente',
      tableroId: tableroActualId,
      sprintId,
      etiquetas: [...etiquetasSeleccionadas],
      creadoPorUid: tareaActual ? tareaActual.creadoPorUid : usuarioActual.uid,
      creadoPorEmail: tareaActual ? tareaActual.creadoPorEmail : usuarioActual.email,
      fechaCreacion: tareaActual ? tareaActual.fechaCreacion : serverTimestamp(),
      proyectoId: tareaActual ? (tareaActual.proyectoId || null) : (proyectoActivoId || null)
    };
  }

  try {
    let tareaIdGuardada = tareaEditandoId;
    if (tareaEditandoId) {
      await updateDoc(doc(db, "tareas", tareaEditandoId), datos);
    } else {
      const nuevaTarea = await addDoc(collection(db, "tareas"), datos);
      tareaIdGuardada = nuevaTarea.id;
    }

    await registrarActividad(
      tableroActualId,
      usuarioActual,
      tareaEditandoId ? ACCIONES.TAREA_EDITADA : ACCIONES.TAREA_CREADA,
      tareaEditandoId ? `Tarea editada: ${titulo}` : `Tarea creada: ${titulo}`,
      tareaIdGuardada
    );

    await registrarCambiosAsignacion(tareaActual, tareaIdGuardada, titulo, usuarioAsignado, colaboradoresUids);

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
  document.getElementById('inp-tipo').value = tarea.tipo || 'tarea';
  document.getElementById('inp-tiempo-estimado').value = tarea.tiempoEstimadoHoras || '';
  document.getElementById('inp-asignado').value = tarea.asignadoUid || '';
  seleccionarMultiple('inp-colaboradores', tarea.colaboradoresUids || []);
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
  const tarea = tareas.find(t => t.id === id);
  await deleteDoc(doc(db, "tareas", id));
  await registrarActividad(tableroActualId, usuarioActual, ACCIONES.TAREA_ELIMINADA,
    `Tarea eliminada: ${tarea?.titulo || id}`, id);
};

window.agregarSubtarea = async () => {
  const input = document.getElementById('inp-subtarea');
  if (!input.value.trim()) return;

  if (tareaEditandoId) {
    // Tarea existente ” guardar directo en subcoleccion
    const texto = input.value.trim();
    await agregarSubtarea(tareaEditandoId, texto, subtareasTemp.length);
    await registrarActividad(tableroActualId, usuarioActual, ACCIONES.SUBTAREA,
      `Subtarea agregada: ${texto}`, tareaEditandoId);
  } else {
    // Tarea nueva” guardar en array temporal como antes
    subtareasTemp.push({ id: crypto.randomUUID(), texto: input.value.trim(), completada: false });
    renderSubtareas();
  }
  input.value = '';
};

function renderSubtareas() {
  const cont = document.getElementById('subtareas-container');
  cont.innerHTML = subtareasTemp.map((s, i) => `
    <div class="subtarea-item ${s.completada ? 'completada' : ''}">
      <input type="checkbox" ${s.completada ? 'checked' : ''} onchange="window.toggleSubtarea('${s.id}', ${s.completada})">
      <span>${s.texto}</span>
      <button type="button" onclick="window.quitarSubtarea('${s.id}')">x</button>
    </div>
  `).join('');
}

window.toggleSubtarea = async (id, completada) => {
  if (tareaEditandoId) {
    await toggleSubtarea(tareaEditandoId, id, !completada);
    await registrarActividad(tableroActualId, usuarioActual, ACCIONES.SUBTAREA,
      `Subtarea ${!completada ? 'completada' : 'reabierta'}`, tareaEditandoId);
  } else {
    const i = subtareasTemp.findIndex(s => s.id === id);
    if (i >= 0) { subtareasTemp[i].completada = !completada; renderSubtareas(); }
  }
};

window.quitarSubtarea = async (id) => {
  if (tareaEditandoId) {
    await eliminarSubtarea(tareaEditandoId, id);
    await registrarActividad(tableroActualId, usuarioActual, ACCIONES.SUBTAREA,
      'Subtarea eliminada', tareaEditandoId);
  } else {
    subtareasTemp = subtareasTemp.filter(s => s.id !== id);
    renderSubtareas();
  }
};

window.filtrarTareas = () => {
  renderizar();
};

function tareaDeActividad(evento) {
  return evento.tareaId ? tareas.find(t => t.id === evento.tareaId) : null;
}

function actividadVisible() {
  const desde = document.getElementById('filtro-actividad-desde')?.value;
  const hasta = document.getElementById('filtro-actividad-hasta')?.value;
  const inicio = desde ? new Date(desde) : null;
  const fin = hasta ? new Date(hasta) : null;

  const eventosPorRol = puedeVerTodo() ? actividad : actividad.filter(evento => {
    if (evento.usuarioId === usuarioActual.uid) return true;
    const tarea = tareaDeActividad(evento);
    return tarea ? tareaEsPropia(tarea) : false;
  });

  return eventosPorRol.filter(evento => {
    const fecha = fechaFirestoreAdate(evento.fechaCreacion);
    if (!fecha || Number.isNaN(fecha.getTime())) return true;
    if (inicio && fecha < inicio) return false;
    if (fin && fecha > fin) return false;
    return true;
  });
}

function formatearFechaActividad(valor) {
  const fecha = fechaFirestoreAdate(valor);
  return fecha && !Number.isNaN(fecha.getTime())
    ? fecha.toLocaleString('es-PE')
    : '';
}

function cargarActividad() {
  if (unsubActividad) unsubActividad();
  unsubActividad = escucharActividad(tableroActualId, (lista) => {
    actividad = lista;
    renderizarActividad();
  });
}

function renderizarActividad() {
  const lista = document.getElementById('lista-actividad');
  if (!lista) return;

  const eventos = actividadVisible();
  if (eventos.length === 0) {
    lista.innerHTML = '<p class="actividad-vacia">Sin eventos registrados aun.</p>';
    return;
  }

  lista.innerHTML = eventos.map(evento => {
    const tarea = tareaDeActividad(evento);
    return `
      <div class="actividad-item">
        <div class="actividad-main">
          <strong>${evento.detalle || evento.accion}</strong>
          <span>${evento.usuarioNombre || evento.usuarioEmail || 'Usuario'} - ${evento.accion}</span>
          ${tarea ? `<small>Tarea: ${tarea.titulo}</small>` : ''}
        </div>
        <time>${formatearFechaActividad(evento.fechaCreacion)}</time>
      </div>
    `;
  }).join('');
}

function escaparCsv(valor) {
  const texto = String(valor ?? '').replace(/"/g, '""');
  return `"${texto}"`;
}

window.abrirModalActividad = () => {
  renderizarActividad();
  document.getElementById('modal-actividad').classList.remove('oculto');
};

window.cerrarModalActividad = () => {
  document.getElementById('modal-actividad').classList.add('oculto');
};

window.filtrarActividad = () => {
  renderizarActividad();
};

window.limpiarFiltroActividad = () => {
  document.getElementById('filtro-actividad-desde').value = '';
  document.getElementById('filtro-actividad-hasta').value = '';
  renderizarActividad();
};

window.exportarActividad = () => {
  const encabezado = ['fecha', 'usuario', 'accion', 'detalle', 'tareaId', 'tarea'];
  const filas = actividadVisible().map(evento => {
    const tarea = tareaDeActividad(evento);
    return [
      formatearFechaActividad(evento.fechaCreacion),
      evento.usuarioEmail || evento.usuarioNombre || '',
      evento.accion || '',
      evento.detalle || '',
      evento.tareaId || '',
      tarea?.titulo || ''
    ];
  });

  const csv = [encabezado, ...filas]
    .map(fila => fila.map(escaparCsv).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `historial-kanban-${new Date().toISOString().slice(0, 10)}.csv`;
  enlace.click();
  URL.revokeObjectURL(url);
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
    subtareasPorTarea.set(tareaId, subtareas);
    renderizar();
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
  await registrarActividad(tableroActualId, usuarioActual, ACCIONES.ADJUNTO,
    `Adjunto agregado: ${nombre}`, tareaEditandoId);
  nombreInput.value = '';
  urlInput.value = '';
};

window.borrarAdjunto = async (adjuntoId) => {
  if (!tareaEditandoId) return;
  if (!confirm("Eliminar este adjunto?")) return;
  await eliminarAdjunto(tareaEditandoId, adjuntoId);
  await registrarActividad(tableroActualId, usuarioActual, ACCIONES.ADJUNTO,
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
    const fin = new Date();
    await updateDoc(doc(db, "tareas", tareaId), {
      tiempoTotalSegundos: total,
      temporizadorActivo: false,
      temporizadorInicio: null,
      temporizadorUsuarioId: ''
    });
    if (inicio && transcurrido > 0) {
      await addDoc(collection(db, "tareas", tareaId, "tiempo_registrado"), {
        usuarioId: usuarioActual.uid,
        usuarioEmail: usuarioActual.email,
        inicio,
        fin,
        minutos: Math.ceil(transcurrido / 60),
        segundos: transcurrido,
        fechaCreacion: serverTimestamp()
      });
    }
    await registrarActividad(tableroActualId, usuarioActual, ACCIONES.TIEMPO,
      `Tiempo registrado: ${formatearTiempo(transcurrido)} (total ${formatearTiempo(total)})`, tareaId);
    return;
  }

  await updateDoc(doc(db, "tareas", tareaId), {
    temporizadorActivo: true,
    temporizadorInicio: new Date(),
    temporizadorUsuarioId: usuarioActual.uid
  });
  await registrarActividad(tableroActualId, usuarioActual, ACCIONES.TIEMPO,
    'Tiempo iniciado', tareaId);
};

window.abrirModalSprints = () => {
  if (!esAdmin() && !esLider()) {
    alert("Solo administrador o lÃ­der pueden gestionar sprints.");
    return;
  }
  if (proyectoEstaCerrado()) {
    alert("El proyecto esta cerrado. No se pueden crear sprints nuevos.");
    return;
  }
  sprintEditandoId = null;
  document.getElementById('btn-guardar-sprint').textContent = 'Crear sprint';
  document.getElementById('modal-sprints').classList.remove('oculto');
};

window.cerrarModalSprints = () => {
  sprintEditandoId = null;
  document.getElementById('modal-sprints').classList.add('oculto');
  document.getElementById('inp-sprint-nombre').value = '';
  document.getElementById('inp-sprint-objetivo').value = '';
  document.getElementById('inp-sprint-inicio').value = '';
  document.getElementById('inp-sprint-fin').value = '';
  document.getElementById('inp-sprint-responsable').value = '';
  document.getElementById('inp-sprint-capacidad').value = '';
  seleccionarMultiple('inp-sprint-participantes', []);
  document.getElementById('btn-guardar-sprint').textContent = 'Crear sprint';
};

window.guardarSprint = async () => {
  const nombre = document.getElementById('inp-sprint-nombre').value.trim();
  const objetivo = document.getElementById('inp-sprint-objetivo').value.trim();
  const inicio = document.getElementById('inp-sprint-inicio').value;
  const fin = document.getElementById('inp-sprint-fin').value;
  const responsable = usuarioPorUid(document.getElementById('inp-sprint-responsable').value);
  const participantesUids = valoresSelectMultiple('inp-sprint-participantes').filter(uid => uid !== responsable?.id);
  const participantesDatos = usuariosPorUids(participantesUids);
  const capacidadHoras = Number(document.getElementById('inp-sprint-capacidad').value || 0);
  const proyectoActivo = proyectoActivoId ? proyectos.find(p => p.id === proyectoActivoId) : null;

  if (!proyectoActivoId || !proyectoActivo) {
    alert("Selecciona o crea un proyecto antes de crear un sprint.");
    return;
  }

  if (!sprintEditandoId && proyectoEstaCerrado(proyectoActivo)) {
    alert("El proyecto esta cerrado. No se pueden crear sprints nuevos.");
    return;
  }

  if (!nombre || !inicio || !fin) {
    alert("Completa todos los campos del sprint.");
    return;
  }

  if (fechaEsAnterior(fin, inicio)) {
    alert("La fecha fin del sprint no puede ser anterior a la fecha de inicio.");
    return;
  }

  if (fechaFueraDeRango(inicio, proyectoActivo.fechaInicio, proyectoActivo.fechaFin) ||
      fechaFueraDeRango(fin, proyectoActivo.fechaInicio, proyectoActivo.fechaFin)) {
    alert(`Las fechas del sprint deben estar dentro del proyecto activo (${textoFecha(proyectoActivo.fechaInicio)} - ${textoFecha(proyectoActivo.fechaFin)}).`);
    return;
  }

  if (capacidadHoras < 0) {
    alert("La capacidad del sprint no puede ser negativa.");
    return;
  }

  const horasCalendarioSprint = horasEntreFechas(inicio, fin);
  if (capacidadHoras > horasCalendarioSprint) {
    alert(`La capacidad del sprint no puede superar sus horas calendario (${horasCalendarioSprint}h).`);
    return;
  }

  const horasYaAsignadasSprint = horasTareasSprint(sprintEditandoId || '__nuevo__');
  if (sprintEditandoId && capacidadHoras > 0 && capacidadHoras < horasYaAsignadasSprint) {
    alert(`La capacidad del sprint no puede ser menor a sus tareas asignadas (${horasYaAsignadasSprint}h).`);
    return;
  }

  if (sprintEditandoId) {
    const tareaFuera = tareas.find(t => t.sprintId === sprintEditandoId && t.fechaLimite && fechaFueraDeRango(t.fechaLimite, inicio, fin));
    if (tareaFuera) {
      alert(`No puedes editar esas fechas: la tarea "${tareaFuera.titulo}" quedaria fuera del sprint.`);
      return;
    }
  }

  const horasProyecto = Number(proyectoActivo.capacidadHoras || 0) || horasEntreFechas(proyectoActivo.fechaInicio, proyectoActivo.fechaFin);
  if (capacidadHoras > horasProyecto) {
    alert(`La capacidad del sprint no puede superar la capacidad del proyecto (${horasProyecto}h).`);
    return;
  }

  const datosSprint = {
    tableroId: tableroActualId,
    proyectoId: proyectoActivoId,
    nombre,
    objetivo,
    fechaInicio: inicio,
    fechaFin: fin,
    responsableUid: responsable ? responsable.id : '',
    responsableEmail: responsable ? responsable.email : '',
    participantesUids,
    participantesEmails: participantesDatos.map(u => u.email),
    capacidadHoras
  };

  if (sprintEditandoId) {
    await actualizarSprint(sprintEditandoId, datosSprint);
  } else {
    await crearSprint(tableroActualId, datosSprint, proyectoActivoId);
  }

  await registrarActividad(tableroActualId, usuarioActual, ACCIONES.SPRINT,
    sprintEditandoId ? `Sprint actualizado: ${nombre}` : `Sprint creado: ${nombre}`);
  cerrarModalSprints();
};

function cargarSprints() {
  if (unsubSprints) unsubSprints();
  unsubSprints = escucharSprints(tableroActualId, proyectoActivoId, (listaSprints) => {
    sprints = listaSprints;
    actualizarSelectSprints();
    renderizarListaSprints();
  });
}

function cargarProyectos() {
  if (unsubProyectos) unsubProyectos();
  unsubProyectos = escucharProyectos(tableroActualId, (lista) => {
    proyectos = lista;
    if (proyectoActivoId && !proyectos.some(p => p.id === proyectoActivoId)) {
      proyectoActivoId = null;
      localStorage.removeItem('proyectoActivo_' + tableroActualId);
    }
    actualizarBotonProyectos();
    renderizarListaProyectos();
    configurarToolbar();
    actualizarEstadoProyectoActivo();
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
  const proyectoCerrado = proyectoEstaCerrado();
  lista.innerHTML = sprints.map(s => `
    <div class="sprint-item">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <strong>${s.nombre}</strong>
        <span class="badge-sprint">${s.estado}</span>
      </div>
      <span style="font-size:12px;color:#999">${s.fechaInicio} - ${s.fechaFin}</span>
      ${s.objetivo ? `<p class="sprint-objetivo">${s.objetivo}</p>` : ''}
      <div class="sprint-detalle">
        <span>Responsable: ${textoResponsableSprint(s)}</span>
        <span>Participantes: ${textoParticipantesSprint(s)}</span>
        <span>Capacidad: ${s.capacidadHoras || 0}h</span>
      </div>
      <div class="sprint-detalle">
        <span>${metricasSprint(s.id).total} tareas</span>
        <span>${metricasSprint(s.id).completadas} completadas</span>
        <span>${metricasSprint(s.id).avance}% avance</span>
      </div>
      <div style="display:flex;gap:6px;margin-top:6px">
        ${!proyectoCerrado ? `<button class="mock-btn" onclick="window.editarSprint('${s.id}')">Editar</button>` : ''}
        ${!proyectoCerrado ? `<button class="mock-btn" onclick="window.cambiarEstadoSprint('${s.id}', 'activo')">Activar</button>` : ''}
        ${!proyectoCerrado ? `<button class="mock-btn" onclick="window.cambiarEstadoSprint('${s.id}', 'cerrado')">Cerrar</button>` : ''}
        ${esAdmin() ? `<button class="mock-btn" style="color:red;border-color:red" onclick="window.borrarSprint('${s.id}', '${s.nombre}')">Eliminar</button>` : ''}
      </div>
    </div>
  `).join('');
}

window.editarSprint = (sprintId) => {
  if (!esAdmin() && !esLider()) {
    alert("Solo administrador o lider pueden editar sprints.");
    return;
  }
  const sprint = sprints.find(s => s.id === sprintId);
  if (!sprint) return;
  sprintEditandoId = sprintId;
  document.getElementById('inp-sprint-nombre').value = sprint.nombre || '';
  document.getElementById('inp-sprint-objetivo').value = sprint.objetivo || '';
  document.getElementById('inp-sprint-inicio').value = sprint.fechaInicio || '';
  document.getElementById('inp-sprint-fin').value = sprint.fechaFin || '';
  document.getElementById('inp-sprint-responsable').value = sprint.responsableUid || '';
  document.getElementById('inp-sprint-capacidad').value = sprint.capacidadHoras || '';
  seleccionarMultiple('inp-sprint-participantes', sprint.participantesUids || []);
  document.getElementById('btn-guardar-sprint').textContent = 'Guardar cambios';
  document.getElementById('modal-sprints').classList.remove('oculto');
};

function textoResponsableSprint(sprint) {
  const responsable = usuarioPorUid(sprint.responsableUid);
  return responsable ? nombreUsuario(responsable) : (sprint.responsableEmail || 'Sin responsable');
}

function textoParticipantesSprint(sprint) {
  const nombres = usuariosPorUids(sprint.participantesUids || []).map(nombreUsuario);
  return nombres.length ? nombres.join(', ') : 'Sin participantes';
}

function metricasSprint(sprintId) {
  const lista = tareas.filter(t => t.sprintId === sprintId);
  const completadas = lista.filter(t => t.estado === 'terminado').length;
  return {
    total: lista.length,
    completadas,
    avance: lista.length ? Math.round((completadas / lista.length) * 100) : 0
  };
}

window.borrarSprint = async (sprintId, nombre) => {
  if (!confirm(`Â¿Eliminar el sprint "${nombre}"?`)) return;
  await eliminarSprint(sprintId);
  await registrarActividad(tableroActualId, usuarioActual, ACCIONES.SPRINT,
    `Sprint eliminado: ${nombre}`);
};

window.cambiarEstadoSprint = async (sprintId, estado) => {
  const sprint = sprints.find(s => s.id === sprintId);
  await actualizarEstadoSprint(sprintId, estado);
  await registrarActividad(tableroActualId, usuarioActual, ACCIONES.SPRINT,
    `Sprint "${sprint?.nombre || sprintId}" cambiado a ${estado}`);
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
  if (!usuarioActual) {
    alert("Debes iniciar sesion.");
    return;
  }
  actualizarDestinoInvitacion();
  const destino = document.getElementById('texto-destino-invitacion');
  if (destino) {
    destino.textContent = esAdmin() || esLider()
      ? 'Registra una invitacion de colaboracion para proyecto, sprint o tarea.'
      : 'Como miembro, tu solicitud quedara pendiente para revision de un lider o administrador.';
  }
  cargarInvitaciones();
  document.getElementById('modal-invitaciones').classList.remove('oculto');
};

window.cerrarModalInvitaciones = () => {
  document.getElementById('modal-invitaciones').classList.add('oculto');
  document.getElementById('inp-invitacion-email').value = '';
  document.getElementById('inp-invitacion-motivo').value = '';
};

window.actualizarDestinoInvitacion = () => {
  const alcance = document.getElementById('inp-invitacion-alcance')?.value || 'proyecto';
  const destino = document.getElementById('inp-invitacion-destino');
  if (!destino) return;

  if (alcance === 'proyecto') {
    const opciones = proyectos
      .filter(p => p.estado === 'activo')
      .map(p => `<option value="${p.id}">${p.nombre}</option>`)
      .join('');
    destino.innerHTML = opciones || '<option value="">-- No hay proyectos activos --</option>';
    if (proyectoActivoId && proyectos.some(p => p.id === proyectoActivoId && p.estado === 'activo')) {
      destino.value = proyectoActivoId;
    }
    return;
  }

  if (alcance === 'sprint') {
    destino.innerHTML = sprints
      .map(s => `<option value="${s.id}">${s.nombre}</option>`)
      .join('') || '<option value="">-- No hay sprints --</option>';
    return;
  }

  destino.innerHTML = tareasFiltradas()
    .map(t => `<option value="${t.id}">${t.titulo}</option>`)
    .join('') || '<option value="">-- No hay tareas disponibles --</option>';
};

window.enviarInvitacion = async () => {
  const email = document.getElementById('inp-invitacion-email').value.trim();
  const alcance = document.getElementById('inp-invitacion-alcance').value;
  const destinoId = document.getElementById('inp-invitacion-destino').value;
  const rolSugerido = document.getElementById('inp-invitacion-rol').value;
  const motivo = document.getElementById('inp-invitacion-motivo').value.trim();
  if (!email) {
    alert("Ingresa un correo.");
    return;
  }
  if (!email.endsWith('@kg.com.pe')) {
    alert("Solo se permiten correos corporativos @kg.com.pe");
    return;
  }
  if (!destinoId) {
    alert("Selecciona un destino para la invitacion.");
    return;
  }
  try {
    const proyecto = alcance === 'proyecto'
      ? proyectos.find(p => p.id === destinoId)
      : proyectoActivo();
    const sprint = alcance === 'sprint' ? sprints.find(s => s.id === destinoId) : null;
    const tarea = alcance === 'tarea' ? tareas.find(t => t.id === destinoId) : null;
    const destinoNombre = proyecto?.nombre || sprint?.nombre || tarea?.titulo || 'Destino no encontrado';
    const estado = 'pendiente';

    await crearInvitacion(tableroActualId, email, usuarioActual.uid, {
      proyectoId: proyecto?.id || null,
      proyectoNombre: proyecto?.nombre || '',
      alcance,
      destinoId,
      destinoNombre,
      rolSugerido,
      tableroNombre: 'Tablero Kanban Arquitectura TI',
      invitadoPorEmail: usuarioActual.email,
      mensaje: `Solicitud de colaboracion en ${alcance}: ${destinoNombre}`,
      motivo,
      estado
    });
    await registrarActividad(tableroActualId, usuarioActual, ACCIONES.INVITACION,
      `Solicitud registrada para ${email} en ${alcance}: ${destinoNombre}`);
    document.getElementById('inp-invitacion-email').value = '';
    document.getElementById('inp-invitacion-motivo').value = '';
    alert("Solicitud registrada para aprobacion.");
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
    invitaciones = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
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
        <span class="proyecto-estado">${inv.alcance || 'proyecto'}: ${inv.destinoNombre || inv.proyectoNombre || 'Tablero general'}</span>
        <span class="proyecto-estado">Rol: ${inv.rolSugerido || 'miembro'}</span>
        <span class="proyecto-estado">${inv.invitadoPorEmail ? `Invitado por: ${inv.invitadoPorEmail}` : ''}</span>
        ${inv.motivo ? `<span class="proyecto-estado">Motivo: ${inv.motivo}</span>` : ''}
      </div>
      ${(esAdmin() || esLider()) && inv.estado === 'pendiente' ? `
        <button class="mock-btn" onclick="window.aprobarInvitacionUI('${inv.id}')">Aprobar</button>
        <button class="mock-btn" onclick="window.rechazarInvitacionUI('${inv.id}')">Rechazar</button>
      ` : ''}
      ${esAdmin() ? `<button class="mock-btn" style="color:red;border-color:red"
        onclick="window.borrarInvitacion('${inv.id}')">Eliminar</button>` : ''}
    </div>
  `).join('');
}

async function aplicarInvitacion(inv) {
  const usuario = usuarioPorEmail(inv.email);
  if (!usuario) {
    alert("El usuario invitado aun no existe en la gestion de usuarios. Crea el usuario primero o deja la solicitud pendiente.");
    return false;
  }

  if (inv.alcance === 'proyecto') {
    const proyecto = proyectos.find(p => p.id === inv.destinoId || p.id === inv.proyectoId);
    if (!proyecto) return false;
    const miembrosUids = Array.from(new Set([...(proyecto.miembrosUids || []), usuario.id]));
    const miembrosEmails = Array.from(new Set([...(proyecto.miembrosEmails || []), usuario.email]));
    await actualizarProyecto(proyecto.id, { miembrosUids, miembrosEmails });
    return true;
  }

  if (inv.alcance === 'sprint') {
    const sprint = sprints.find(s => s.id === inv.destinoId);
    if (!sprint) return false;
    const participantesUids = Array.from(new Set([...(sprint.participantesUids || []), usuario.id]));
    const participantesEmails = Array.from(new Set([...(sprint.participantesEmails || []), usuario.email]));
    await actualizarSprint(sprint.id, { participantesUids, participantesEmails });
    return true;
  }

  const tarea = tareas.find(t => t.id === inv.destinoId);
  if (!tarea) return false;
  const colaboradoresUids = Array.from(new Set([...(tarea.colaboradoresUids || []), usuario.id]));
  const colaboradoresEmails = Array.from(new Set([...(tarea.colaboradoresEmails || []), usuario.email]));
  await updateDoc(doc(db, "tareas", tarea.id), { colaboradoresUids, colaboradoresEmails });
  return true;
}

window.aprobarInvitacionUI = async (invId) => {
  const inv = invitaciones.find(i => i.id === invId);
  if (!inv) return;
  const aplicada = await aplicarInvitacion(inv);
  if (!aplicada) return;
  await aceptarInvitacion(invId);
  await registrarActividad(tableroActualId, usuarioActual, ACCIONES.INVITACION,
    `Invitacion aprobada para ${inv.email} en ${inv.alcance}: ${inv.destinoNombre || inv.proyectoNombre || ''}`);
  await notificarUsuario(usuarioPorEmail(inv.email)?.id, 'invitacion_aprobada', inv.destinoId || inv.proyectoId || tableroActualId,
    `Tu solicitud fue aprobada: ${inv.destinoNombre || inv.proyectoNombre || 'tablero'}`);
};

window.rechazarInvitacionUI = async (invId) => {
  const inv = invitaciones.find(i => i.id === invId);
  if (!inv) return;
  await rechazarInvitacion(invId);
  await registrarActividad(tableroActualId, usuarioActual, ACCIONES.INVITACION,
    `Invitacion rechazada para ${inv.email}`);
};

window.borrarInvitacion = async (invId) => {
  if (!confirm("¿Eliminar esta invitacion?")) return;
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
    await registrarActividad(tableroActualId, usuarioActual, ACCIONES.CONFIG,
      'Configuracion del tablero actualizada');
  }

  cerrarConfig();
  alert("Ajustes guardados.");
};


function actualizarBotonProyectos() {
  const btn = document.getElementById('btn-nombre-proyecto');
  if (!btn) return;
  if (proyectoActivoId) {
    const activo = proyectos.find(p => p.id === proyectoActivoId);
    btn.textContent = activo ? activo.nombre : 'Proyectos';
  } else {
    btn.textContent = 'Proyectos';
  }
}

function renderizarListaProyectos() {
  const cont = document.getElementById('lista-proyectos-dropdown');
  if (!cont) return;
  actualizarVisibilidadCrearProyecto();

  if (proyectos.length === 0) {
    cont.innerHTML = '<p style="color:#999;font-size:12px;padding:8px;">No hay proyectos aun.</p>';
    return;
  }

  const gestion = esAdmin() || esLider();

  cont.innerHTML = proyectos.map(p => {
    const activo = p.id === proyectoActivoId;
    return `
      <div class="proyecto-dropdown-item ${activo ? 'activo' : ''}" onclick="window.seleccionarProyecto('${p.id}')">
        <div>
          <strong>${p.nombre}</strong>
          <span class="proyecto-estado">${p.estado}</span>
          <span class="proyecto-estado">${p.fechaInicio || '-'} - ${p.fechaFin || '-'}</span>
          <span class="proyecto-estado">Resp: ${textoResponsableProyecto(p)}</span>
          <span class="proyecto-estado">Miembros: ${textoMiembrosProyecto(p)}</span>
          <span class="proyecto-estado">Capacidad: ${p.capacidadHoras || 0}h</span>
        </div>
        <div class="proyecto-dropdown-acciones">
          ${gestion ? `<span title="Editar" onclick="event.stopPropagation(); window.editarProyectoUI('${p.id}')">Editar</span>` : ''}
          ${gestion && p.estado === 'activo' ? `<span title="Finalizar" onclick="event.stopPropagation(); window.finalizarProyecto('${p.id}', '${p.nombre}')">Finalizar</span>` : ''}
          ${gestion && p.estado !== 'activo' ? `<span title="Reabrir" onclick="event.stopPropagation(); window.reabrirProyecto('${p.id}', '${p.nombre}')">Reabrir</span>` : ''}
          ${esAdmin() ? `<span title="Eliminar" onclick="event.stopPropagation(); window.borrarProyectoUI('${p.id}', '${p.nombre}')">Eliminar</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function textoResponsableProyecto(proyecto) {
  const responsable = usuarioPorUid(proyecto.responsableUid);
  return responsable ? nombreUsuario(responsable) : (proyecto.responsableEmail || 'Sin responsable');
}

function textoMiembrosProyecto(proyecto) {
  const nombres = usuariosPorUids(proyecto.miembrosUids || []).map(nombreUsuario);
  return nombres.length ? nombres.join(', ') : 'Sin miembros';
}

function actualizarVisibilidadCrearProyecto() {
  const btnCrear = document.getElementById('btn-crear-proyecto-dropdown');
  if (btnCrear) btnCrear.style.display = (esAdmin() || esLider()) ? 'flex' : 'none';
}

window.toggleDropdownProyectos = () => {
  document.getElementById('dropdown-proyectos').classList.toggle('oculto');
};

window.seleccionarProyecto = (proyectoId) => {
  proyectoActivoId = proyectoId;
  localStorage.setItem('proyectoActivo_' + tableroActualId, proyectoId);
  actualizarBotonProyectos();
  renderizarListaProyectos();
  actualizarEstadoProyectoActivo();
  cargarSprints();
  escucharTareas();
  document.getElementById('dropdown-proyectos').classList.add('oculto');
};

window.abrirModalCrearProyecto = () => {
  if (!esAdmin() && !esLider()) {
    alert("Solo administrador o lider pueden crear proyectos.");
    return;
  }
  proyectoEditandoId = null;
  document.getElementById('dropdown-proyectos').classList.add('oculto');
  document.getElementById('inp-proyecto-nombre').value = '';
  document.getElementById('inp-proyecto-descripcion').value = '';
  document.getElementById('inp-proyecto-fechainicio').value = new Date().toISOString().slice(0, 10);
  document.getElementById('inp-proyecto-fechafin').value = '';
  document.getElementById('inp-proyecto-responsable').value = usuarioActual.uid;
  document.getElementById('inp-proyecto-capacidad').value = '';
  seleccionarMultiple('inp-proyecto-miembros', [usuarioActual.uid]);
  document.getElementById('btn-guardar-proyecto').textContent = 'Crear proyecto';
  document.getElementById('modal-crear-proyecto').classList.remove('oculto');
};

window.cerrarModalCrearProyecto = () => {
  proyectoEditandoId = null;
  document.getElementById('modal-crear-proyecto').classList.add('oculto');
  document.getElementById('btn-guardar-proyecto').textContent = 'Crear proyecto';
};

window.guardarNuevoProyecto = async () => {
  const nombre = document.getElementById('inp-proyecto-nombre').value.trim();
  const descripcion = document.getElementById('inp-proyecto-descripcion').value.trim();
  const fechaInicio = document.getElementById('inp-proyecto-fechainicio').value;
  const fechaFin = document.getElementById('inp-proyecto-fechafin').value;
  const responsable = usuarioPorUid(document.getElementById('inp-proyecto-responsable').value);
  const miembrosUids = Array.from(new Set([
    ...(responsable ? [responsable.id] : []),
    ...valoresSelectMultiple('inp-proyecto-miembros')
  ]));
  const miembrosDatos = usuariosPorUids(miembrosUids);
  const capacidadHoras = Number(document.getElementById('inp-proyecto-capacidad').value || 0);

  if (!nombre) {
    alert("El nombre del proyecto es obligatorio.");
    return;
  }
  if (!fechaInicio) {
    alert("La fecha de inicio es obligatoria.");
    return;
  }
  if (!fechaFin) {
    alert("La fecha limite es obligatoria.");
    return;
  }
  if (fechaEsAnterior(fechaFin, fechaInicio)) {
    alert("La fecha fin estimada no puede ser anterior a la fecha de inicio.");
    return;
  }
  if (capacidadHoras < 0) {
    alert("La capacidad del proyecto no puede ser negativa.");
    return;
  }
  const horasCalendarioProyecto = horasEntreFechas(fechaInicio, fechaFin);
  if (capacidadHoras > horasCalendarioProyecto * Math.max(1, miembrosUids.length)) {
    alert(`La capacidad del proyecto supera las horas disponibles de sus miembros (${horasCalendarioProyecto * Math.max(1, miembrosUids.length)}h).`);
    return;
  }

  if (proyectoEditandoId) {
    const sprintFuera = sprintsDelProyecto(proyectoEditandoId).find(s =>
      fechaFueraDeRango(s.fechaInicio, fechaInicio, fechaFin) ||
      fechaFueraDeRango(s.fechaFin, fechaInicio, fechaFin)
    );
    if (sprintFuera) {
      alert(`No puedes editar esas fechas: el sprint "${sprintFuera.nombre}" quedaria fuera del proyecto.`);
      return;
    }

    const tareaFuera = tareas.find(t => t.proyectoId === proyectoEditandoId && t.fechaLimite && fechaFueraDeRango(t.fechaLimite, fechaInicio, fechaFin));
    if (tareaFuera) {
      alert(`No puedes editar esas fechas: la tarea "${tareaFuera.titulo}" quedaria fuera del proyecto.`);
      return;
    }

    const horasYaAsignadas = horasTareasProyecto(proyectoEditandoId);
    if (capacidadHoras > 0 && capacidadHoras < horasYaAsignadas) {
      alert(`La capacidad del proyecto no puede ser menor a sus tareas asignadas (${horasYaAsignadas}h).`);
      return;
    }
  }

  const datosProyecto = {
    tableroId: tableroActualId,
    nombre,
    descripcion,
    fechaInicio,
    fechaFin,
    responsableUid: responsable ? responsable.id : '',
    responsableEmail: responsable ? responsable.email : '',
    miembrosUids,
    miembrosEmails: miembrosDatos.map(u => u.email),
    capacidadHoras
  };

  if (proyectoEditandoId) {
    await actualizarProyecto(proyectoEditandoId, datosProyecto);
  } else {
    await crearProyecto(tableroActualId, datosProyecto, usuarioActual.uid);
  }

  await registrarActividad(tableroActualId, usuarioActual, ACCIONES.PROYECTO,
    proyectoEditandoId ? `Proyecto actualizado: ${nombre}` : `Proyecto creado: ${nombre}`);
  window.cerrarModalCrearProyecto();
};

window.editarProyectoUI = (proyectoId) => {
  if (!esAdmin() && !esLider()) {
    alert("Solo administrador o lider pueden editar proyectos.");
    return;
  }
  const proyecto = proyectos.find(p => p.id === proyectoId);
  if (!proyecto) return;
  proyectoEditandoId = proyectoId;
  document.getElementById('dropdown-proyectos').classList.add('oculto');
  document.getElementById('inp-proyecto-nombre').value = proyecto.nombre || '';
  document.getElementById('inp-proyecto-descripcion').value = proyecto.descripcion || '';
  document.getElementById('inp-proyecto-fechainicio').value = proyecto.fechaInicio || '';
  document.getElementById('inp-proyecto-fechafin').value = proyecto.fechaFin || '';
  document.getElementById('inp-proyecto-responsable').value = proyecto.responsableUid || '';
  document.getElementById('inp-proyecto-capacidad').value = proyecto.capacidadHoras || '';
  seleccionarMultiple('inp-proyecto-miembros', proyecto.miembrosUids || []);
  document.getElementById('btn-guardar-proyecto').textContent = 'Guardar cambios';
  document.getElementById('modal-crear-proyecto').classList.remove('oculto');
};

window.finalizarProyecto = async (proyectoId, nombre) => {
  if (!esAdmin() && !esLider()) {
    alert("Solo administrador o lider pueden finalizar proyectos.");
    return;
  }
  if (!confirm(`Marcar "${nombre}" como cerrado?`)) return;
  await cambiarEstadoProyecto(proyectoId, "cerrado");
  await registrarActividad(tableroActualId, usuarioActual, ACCIONES.PROYECTO,
    `Proyecto finalizado: ${nombre}`);
  actualizarEstadoProyectoActivo();
};

window.reabrirProyecto = async (proyectoId, nombre) => {
  if (!esAdmin() && !esLider()) {
    alert("Solo administrador o lider pueden reabrir proyectos.");
    return;
  }
  if (!confirm(`Reabrir el proyecto "${nombre}"?`)) return;
  await cambiarEstadoProyecto(proyectoId, "activo");
  await registrarActividad(tableroActualId, usuarioActual, ACCIONES.PROYECTO,
    `Proyecto reabierto: ${nombre}`);
  actualizarEstadoProyectoActivo();
};

window.borrarProyectoUI = async (proyectoId, nombre) => {
  if (!esAdmin()) return;
  if (!confirm(`Eliminar el proyecto "${nombre}"? Esto no elimina sus tareas.`)) return;
  await eliminarProyecto(proyectoId);
  if (proyectoActivoId === proyectoId) {
    proyectoActivoId = null;
    localStorage.removeItem('proyectoActivo_' + tableroActualId);
    cargarSprints();
    escucharTareas();
  }
};

document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('dropdown-proyectos');
  const btn = document.getElementById('btn-proyectos');
  if (!dropdown || !btn) return;
  if (!dropdown.classList.contains('oculto') && !dropdown.contains(e.target) && !btn.contains(e.target)) {
    dropdown.classList.add('oculto');
  }
});
