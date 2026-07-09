// js/tableros.js
import { db } from './firebase-config.js';
import {
  addDoc,
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Obtiene el tablero principal del usuario o lo crea si no existe
export async function obtenerOCrearTablero(uid) {
  const q = query(collection(db, "tableros"), where("creadorId", "==", uid));
  const snapshot = await getDocs(q);

  if (!snapshot.empty) {
    return snapshot.docs[0].id;
  }

  // No existe ningún tablero, creamos uno por defecto
  const nuevoTablero = await addDoc(collection(db, "tableros"), {
    nombre: "Tablero Principal - Kallpa Generacion",
    creadorId: uid,
    fechaCreacion: new Date()
  });

  await crearColumnasPorDefecto(nuevoTablero.id);
  return nuevoTablero.id;
}

// Crea las 3 columnas iniciales vinculadas al tablero
async function crearColumnasPorDefecto(tableroId) {
  const columnasIniciales = [
    { nombre: "Pendiente",   orden: 1, estadoClave: "pendiente"  },
    { nombre: "En proceso",  orden: 2, estadoClave: "en_proceso" },
    { nombre: "Terminado",   orden: 3, estadoClave: "terminado"  }
  ];

  for (const col of columnasIniciales) {
    await addDoc(collection(db, "columnas"), {
      tableroId,
      nombre:      col.nombre,
      orden:       col.orden,
      estadoClave: col.estadoClave,
      limiteWip:   null
    });
  }
}

// Devuelve las columnas de un tablero ordenadas
export async function obtenerColumnas(tableroId) {
  const q = query(
    collection(db, "columnas"),
    where("tableroId", "==", tableroId)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.orden - b.orden);
}