// js/invitaciones.js
import { db } from './firebase-config.js';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Escucha invitaciones pendientes para un email
export function escucharInvitaciones(email, callback) {
  const q = query(
    collection(db, "invitaciones"),
    where("email", "==", email),
    where("estado", "==", "pendiente")
  );
  return onSnapshot(q, (snapshot) => {
    const invitaciones = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(invitaciones);
  });
}

// Crea una invitación nueva
export async function crearInvitacion(tableroId, email, invitadoPorId, contexto = {}) {
  // Verificar dominio corporativo
  if (!email.endsWith('@kg.com.pe')) {
    throw new Error('Solo se permiten correos corporativos @kg.com.pe');
  }

  await addDoc(collection(db, "invitaciones"), {
    tableroId,
    proyectoId: contexto.proyectoId || null,
    proyectoNombre: contexto.proyectoNombre || "",
    alcance: contexto.alcance || "proyecto",
    destinoId: contexto.destinoId || contexto.proyectoId || null,
    destinoNombre: contexto.destinoNombre || contexto.proyectoNombre || "",
    rolSugerido: contexto.rolSugerido || "miembro",
    tableroNombre: contexto.tableroNombre || "Tablero Kanban",
    email,
    invitadoPorId,
    invitadoPorEmail: contexto.invitadoPorEmail || "",
    mensaje: contexto.mensaje || "",
    motivo: contexto.motivo || "",
    estado: contexto.estado || "pendiente",
    fechaExpiracion: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 días
  });
}

// Acepta una invitación
export async function aceptarInvitacion(invitacionId) {
  await updateDoc(doc(db, "invitaciones", invitacionId), {
    estado: "aceptada"
  });
}

// Rechaza una invitación
export async function rechazarInvitacion(invitacionId) {
  await updateDoc(doc(db, "invitaciones", invitacionId), {
    estado: "rechazada"
  });
}

// Elimina una invitación (solo admin)
export async function eliminarInvitacion(invitacionId) {
  await deleteDoc(doc(db, "invitaciones", invitacionId));
}
