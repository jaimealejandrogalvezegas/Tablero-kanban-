// js/etiquetas.js
import { db } from './firebase-config.js';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Escucha en tiempo real las etiquetas de un tablero
export function escucharEtiquetas(tableroId, callback) {
  const q = query(
    collection(db, "etiquetas"),
    where("tableroId", "==", tableroId)
  );
  return onSnapshot(q, (snapshot) => {
    const etiquetas = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(etiquetas);
  });
}

// Crea una etiqueta nueva
export async function crearEtiqueta(tableroId, nombre, color) {
  await addDoc(collection(db, "etiquetas"), {
    tableroId,
    nombre,
    color
  });
}

// Elimina una etiqueta
export async function eliminarEtiqueta(etiquetaId) {
  await deleteDoc(doc(db, "etiquetas", etiquetaId));
}