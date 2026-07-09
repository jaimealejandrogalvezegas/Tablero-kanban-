// js/notificaciones.js
import { db } from './firebase-config.js';
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  doc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Escucha en tiempo real las notificaciones del usuario actual
export function escucharNotificaciones(usuarioId, callback) {
  const q = query(
    collection(db, "notificaciones"),
    where("usuarioId", "==", usuarioId),
    orderBy("fechaCreacion", "desc")
  );
  return onSnapshot(q, (snapshot) => {
    const notificaciones = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(notificaciones);
  });
}

// Crea una notificación para un usuario
export async function crearNotificacion(usuarioId, tipo, referenciaId, mensaje) {
  await addDoc(collection(db, "notificaciones"), {
    usuarioId,
    tipo,
    referenciaId,
    mensaje,
    leida: false,
    fechaCreacion: new Date()
  });
}

// Marca una notificación como leída
export async function marcarLeida(notificacionId) {
  await updateDoc(doc(db, "notificaciones", notificacionId), {
    leida: true
  });
}