// js/adjuntos.js
import { db } from './firebase-config.js';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Escucha en tiempo real los adjuntos de una tarea
export function escucharAdjuntos(tareaId, callback) {
  const q = query(
    collection(db, "tareas", tareaId, "adjuntos"),
    orderBy("fechaSubida", "desc")
  );
  return onSnapshot(q, (snapshot) => {
    const adjuntos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(adjuntos);
  });
}

// Registra los metadatos de un adjunto
// La URL viene de Firebase Storage (por ahora se pasa manual)
export async function agregarAdjunto(tareaId, archivo, usuario) {
  await addDoc(collection(db, "tareas", tareaId, "adjuntos"), {
    nombre: archivo.nombre,
    url: archivo.url,
    mimeType: archivo.mimeType,
    tamanoBytes: archivo.tamanoBytes || 0,
    subidoPorId: usuario.uid,
    subidoPorEmail: usuario.email,
    fechaSubida: serverTimestamp()
  });
}

// Elimina un adjunto
export async function eliminarAdjunto(tareaId, adjuntoId) {
  await deleteDoc(doc(db, "tareas", tareaId, "adjuntos", adjuntoId));
}