// js/tableros.js
import { db } from './firebase-config.js';
import {
  addDoc,
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const NOMBRE_TABLERO_PRINCIPAL = "Tablero Principal - Kallpa Generacion";

function fechaOrdenable(valor) {
  if (!valor) return 0;
  if (valor.toMillis) return valor.toMillis();
  const fecha = valor.toDate ? valor.toDate() : new Date(valor);
  return Number.isNaN(fecha.getTime()) ? 0 : fecha.getTime();
}

// Obtiene el tablero principal compartido o lo crea si no existe.
export async function obtenerOCrearTablero(uid) {
  const qPrincipal = query(
    collection(db, "tableros"),
    where("nombre", "==", NOMBRE_TABLERO_PRINCIPAL)
  );
  const snapshotPrincipal = await getDocs(qPrincipal);

  if (!snapshotPrincipal.empty) {
    const tableros = snapshotPrincipal.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => fechaOrdenable(a.fechaCreacion) - fechaOrdenable(b.fechaCreacion));
    return tableros[0].id;
  }

  const nuevoTablero = await addDoc(collection(db, "tableros"), {
    nombre: NOMBRE_TABLERO_PRINCIPAL,
    creadorId: uid,
    compartido: true,
    fechaCreacion: new Date()
  });

  await crearColumnasPorDefecto(nuevoTablero.id);
  return nuevoTablero.id;
}

async function crearColumnasPorDefecto(tableroId) {
  const columnasIniciales = [
    { nombre: "Pendiente", orden: 1, estadoClave: "pendiente" },
    { nombre: "En proceso", orden: 2, estadoClave: "en_proceso" },
    { nombre: "Terminado", orden: 3, estadoClave: "terminado" }
  ];

  for (const col of columnasIniciales) {
    await addDoc(collection(db, "columnas"), {
      tableroId,
      nombre: col.nombre,
      orden: col.orden,
      estadoClave: col.estadoClave,
      limiteWip: null
    });
  }
}

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
