// js/subtareas.js
import { db } from './firebase-config.js';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Escucha en tiempo real las subtareas de una tarea
export function escucharSubtareas(tareaId, callback) {
  const q = query(
    collection(db, "tareas", tareaId, "subtareas"),
    orderBy("orden")
  );
  return onSnapshot(q, (snapshot) => {
    const subtareas = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(subtareas);
  });
}

// Agrega una subtarea nueva
export async function agregarSubtarea(tareaId, texto, orden) {
  await addDoc(collection(db, "tareas", tareaId, "subtareas"), {
    texto,
    completada: false,
    orden
  });
}

// Marca o desmarca una subtarea
export async function toggleSubtarea(tareaId, subtareaId, completada) {
  await updateDoc(doc(db, "tareas", tareaId, "subtareas", subtareaId), {
    completada
  });
}

// Elimina una subtarea
export async function eliminarSubtarea(tareaId, subtareaId) {
  await deleteDoc(doc(db, "tareas", tareaId, "subtareas", subtareaId));
}