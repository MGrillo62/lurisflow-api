import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";

import { casosRouter } from "./routes/casos.js";
import { citasRouter } from "./routes/citas.js";
import { cursosRouter } from "./routes/cursos.js";
import { adminRouter } from "./routes/admin.js";

const app = new Hono();

// ── Middlewares globales ──────────────────────────────────────────────────────

app.use("*", logger());
app.use("*", secureHeaders());

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "").split(",").filter(Boolean);

app.use(
  "*",
  cors({
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : allowedOrigins[0] ?? "*"),
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

// ── Health check ─────────────────────────────────────────────────────────────

app.get("/health", (c) =>
  c.json({ status: "ok", service: "lurisflow-api", version: "1.0.0" })
);

// ── Rutas v1 ──────────────────────────────────────────────────────────────────

app.route("/v1/casos", casosRouter);
app.route("/v1/citas", citasRouter);
app.route("/v1/cursos", cursosRouter);
app.route("/v1/admin", adminRouter);

// ── 404 handler ──────────────────────────────────────────────────────────────

app.notFound((c) =>
  c.json({ success: false, error: `Ruta no encontrada: ${c.req.method} ${c.req.path}` }, 404)
);

// ── Error handler ─────────────────────────────────────────────────────────────

app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ success: false, error: "Error interno del servidor" }, 500);
});

// ── Start server ──────────────────────────────────────────────────────────────

const port = Number(process.env.PORT ?? 4000);

serve({ fetch: app.fetch, port }, () => {
  console.log(`🚀 LurisFlow API v1 corriendo en http://localhost:${port}`);
  console.log(`📋 Health check: http://localhost:${port}/health`);
});
