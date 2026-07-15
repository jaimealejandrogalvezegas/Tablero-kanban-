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

// Escucha en tiempo real los sprints de un tablero, opcionalmente filtrados por proyecto
export function escucharSprints(tableroId, proyectoId, callback) {
  let condiciones = [
    collection(db, "sprints"),
    where("tableroId", "==", tableroId)
  ];
  if (proyectoId) {
    condiciones.push(where("proyectoId", "==", proyectoId));
  }
  condiciones.push(orderBy("fechaInicio", "asc"));

  const q = query(...condiciones);
  return onSnapshot(q, (snapshot) => {
    const sprints = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(sprints);
  }, (error) => console.error("Error al cargar sprints:", error));
}

// Crea un sprint nuevo, asociado (opcionalmente) a un proyecto
export async function crearSprint(tableroId, datos, proyectoId) {
  await addDoc(collection(db, "sprints"), {
    tableroId,
    proyectoId: proyectoId || null,
    nombre: datos.nombre,
    objetivo: datos.objetivo || "",
    fechaInicio: datos.fechaInicio,
    fechaFin: datos.fechaFin,
    responsableUid: datos.responsableUid || "",
    responsableEmail: datos.responsableEmail || "",
    participantesUids: datos.participantesUids || [],
    participantesEmails: datos.participantesEmails || [],
    capacidadHoras: Number(datos.capacidadHoras || 0),
    estado: "planificado"
  });
}

// Cambia el estado de un sprint
export async function actualizarEstadoSprint(sprintId, estado) {
  await updateDoc(doc(db, "sprints", sprintId), { estado });
}

// Actualiza datos completos del sprint
export async function actualizarSprint(sprintId, datos) {
  await updateDoc(doc(db, "sprints", sprintId), datos);
}

// Elimina un sprint
export async function eliminarSprint(sprintId) {
  await deleteDoc(doc(db, "sprints", sprintId));
}
