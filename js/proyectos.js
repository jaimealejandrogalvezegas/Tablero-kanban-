// js/proyectos.js
import { db } from './firebase-config.js';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Escucha en tiempo real los proyectos de un tablero
export function escucharProyectos(tableroId, callback) {
  const q = query(
    collection(db, "proyectos"),
    where("tableroId", "==", tableroId),
    orderBy("fechaCreacion", "desc")
  );
  return onSnapshot(q, (snapshot) => {
    const proyectos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(proyectos);
  }, (error) => console.error("Error al cargar proyectos:", error));
}

// Crea un nuevo proyecto
export async function crearProyecto(tableroId, datos, uid) {
  await addDoc(collection(db, "proyectos"), {
    tableroId,
    nombre: datos.nombre,
    descripcion: datos.descripcion || "",
    fechaInicio: datos.fechaInicio || null,
    fechaFin: datos.fechaFin || null,
    responsableUid: datos.responsableUid || "",
    responsableEmail: datos.responsableEmail || "",
    miembrosUids: datos.miembrosUids || [],
    miembrosEmails: datos.miembrosEmails || [],
    capacidadHoras: Number(datos.capacidadHoras || 0),
    estado: "activo",
    creadoPorUid: uid,
    fechaCreacion: serverTimestamp()
  });
}

// Actualiza un proyecto (nombre, descripcion, fechaFin, estado, etc.)
export async function actualizarProyecto(proyectoId, datos) {
  await updateDoc(doc(db, "proyectos", proyectoId), datos);
}

// Cambia solo el estado (activo/cerrado) - util para "finalizar" un proyecto
export async function cambiarEstadoProyecto(proyectoId, estado) {
  await updateDoc(doc(db, "proyectos", proyectoId), { estado });
}

// Elimina un proyecto (solo admin, validado en app.js y en firestore.rules)
export async function eliminarProyecto(proyectoId) {
  await deleteDoc(doc(db, "proyectos", proyectoId));
}
