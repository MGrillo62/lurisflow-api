import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

/**
 * Pool de conexiones a NEON PostgreSQL.
 * NUNCA exponer esta instancia fuera de la capa de backend.
 */
export const sql = postgres(connectionString, {
  ssl: "require",
  max: 10,             // max conexiones en el pool
  idle_timeout: 30,    // segundos antes de cerrar conexión idle
  connect_timeout: 10, // segundos máximo para establecer conexión
});
