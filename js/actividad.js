// js/actividad.js
import { db } from './firebase-config.js';
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Escucha en tiempo real la actividad reciente de un tablero
export function escucharActividad(tableroId, callback) {
  const q = query(
    collection(db, "tableros", tableroId, "actividad"),
    orderBy("fechaCreacion", "desc"),
    limit(50)
  );
  return onSnapshot(q, (snapshot) => {
    const actividad = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(actividad);
  });
}

// Registra una acción en el historial del tablero
export async function registrarActividad(tableroId, usuario, accion, detalle, tareaId = null) {
  await addDoc(collection(db, "tableros", tableroId, "actividad"), {
    usuarioId: usuario.uid,
    usuarioEmail: usuario.email,
    usuarioNombre: usuario.email.split('@')[0],
    accion,
    detalle,
    tareaId,
    fechaCreacion: new Date()
  });
}

// Acciones predefinidas para usar en app.js
export const ACCIONES = {
  TAREA_CREADA:   "tarea_creada",
  TAREA_MOVIDA:   "tarea_movida",
  TAREA_EDITADA:  "tarea_editada",
  TAREA_ELIMINADA:"tarea_eliminada",
  COMENTARIO:     "comentario_agregado",
  USUARIO_UNIDO:  "usuario_unido"
};