// js/comentarios.js
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

// Escucha en tiempo real los comentarios de una tarea
export function escucharComentarios(tareaId, callback) {
  const q = query(
    collection(db, "tareas", tareaId, "comentarios"),
    orderBy("fechaCreacion", "asc")
  );
  return onSnapshot(q, (snapshot) => {
    const comentarios = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(comentarios);
  });
}

// Agrega un comentario nuevo
export async function agregarComentario(tareaId, texto, usuario) {
  await addDoc(collection(db, "tareas", tareaId, "comentarios"), {
    texto,
    autorId: usuario.uid,
    autorEmail: usuario.email,
    autorNombre: usuario.email.split('@')[0],
    fechaCreacion: serverTimestamp()
  });
}

// Elimina un comentario (solo admin)
export async function eliminarComentario(tareaId, comentarioId) {
  await deleteDoc(doc(db, "tareas", tareaId, "comentarios", comentarioId));
}