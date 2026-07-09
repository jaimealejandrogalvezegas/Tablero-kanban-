// js/sprints.js
import { db } from './firebase-config.js';
import {
  addDoc,
  collection,
  doc,
  deleteDoc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Escucha en tiempo real los sprints de un tablero
export function escucharSprints(tableroId, callback) {
  const q = query(
    collection(db, "sprints"),
    where("tableroId", "==", tableroId),
    orderBy("fechaInicio", "asc")
  );
  return onSnapshot(q, (snapshot) => {
    const sprints = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(sprints);
  });
}

// Crea un sprint nuevo
export async function crearSprint(tableroId, datos) {
  await addDoc(collection(db, "sprints"), {
    tableroId,
    nombre: datos.nombre,
    fechaInicio: datos.fechaInicio,
    fechaFin: datos.fechaFin,
    estado: "planificado"
  });
}

// Cambia el estado de un sprint
export async function actualizarEstadoSprint(sprintId, estado) {
  await updateDoc(doc(db, "sprints", sprintId), { estado });
}

// Elimina un sprint
export async function eliminarSprint(sprintId) {
  await deleteDoc(doc(db, "sprints", sprintId));
}