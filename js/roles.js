// js/roles.js
import { db } from './firebase-config.js';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Obtiene todos los roles de un tablero
export async function obtenerRoles(tableroId) {
  const q = query(
    collection(db, "roles_permisos"),
    where("tableroId", "==", tableroId)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Asigna un rol a un usuario en un tablero
export async function asignarRol(tableroId, usuarioId, nivel) {
  // Verificar si ya existe un rol para ese usuario en ese tablero
  const q = query(
    collection(db, "roles_permisos"),
    where("tableroId", "==", tableroId),
    where("usuarioId", "==", usuarioId)
  );
  const snapshot = await getDocs(q);

  if (!snapshot.empty) {
    // Ya existe, actualizamos
    await updateDoc(doc(db, "roles_permisos", snapshot.docs[0].id), { nivel });
  } else {
    // No existe, creamos
    await addDoc(collection(db, "roles_permisos"), {
      tableroId,
      usuarioId,
      nivel,
      assignedAt: new Date()
    });
  }
}

// Elimina el rol de un usuario en un tablero
export async function eliminarRol(rolId) {
  await deleteDoc(doc(db, "roles_permisos", rolId));
}