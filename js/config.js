// js/config.js
import { db } from './firebase-config.js';
import {
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Obtiene la configuración de un tablero
export async function obtenerConfig(tableroId) {
  const ref = doc(db, "config_tablero", tableroId);
  const snapshot = await getDoc(ref);

  if (snapshot.exists()) {
    return snapshot.data();
  }

  // Si no existe, devuelve configuración por defecto
  return {
    tema: "claro",
    vistaDefault: "kanban",
    notifEmail: false
  };
}

// Guarda o actualiza la configuración de un tablero
export async function guardarConfig(tableroId, config) {
  await setDoc(doc(db, "config_tablero", tableroId), {
    tableroId,
    tema: config.tema || "claro",
    vistaDefault: config.vistaDefault || "kanban",
    notifEmail: config.notifEmail || false
  }, { merge: true });
}