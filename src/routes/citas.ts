import { Hono } from "hono";
import { sql } from "../db/index.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/rbac.middleware.js";

export const citasRouter = new Hono();

/**
 * GET /v1/citas
 * ABOGADO: ve sus citas del día / semana según tenant
 * CLIENTE: ve sus propias citas
 * ADMIN_TENANT / SOPORTE_ADMIN: ve todas las citas del tenant
 */
citasRouter.get("/", authMiddleware, async (c) => {
  const auth = c.get("auth");
  const { desde, hasta } = c.req.query();

  try {
    let citas;

    if (auth.role === "CLIENTE") {
      citas = await sql`
        SELECT
          ci.id, ci.type, ci.status, ci.scheduled_at,
          ci.duration_minutes, ci.google_meet_link,
          ci.price, ci.payment_status,
          ab.full_name AS abogado_nombre,
          ab.profile_picture_url AS abogado_foto
        FROM citas ci
        LEFT JOIN users ab ON ab.id = ci.abogado_id
        WHERE ci.cliente_id = ${auth.userId}
          AND ci.tenant_id = ${auth.tenantId}
          ${desde ? sql`AND ci.scheduled_at >= ${desde}` : sql``}
          ${hasta ? sql`AND ci.scheduled_at <= ${hasta}` : sql``}
        ORDER BY ci.scheduled_at ASC
      `;
    } else if (auth.role === "ABOGADO") {
      citas = await sql`
        SELECT
          ci.id, ci.type, ci.status, ci.scheduled_at,
          ci.duration_minutes, ci.google_meet_link,
          ci.price, ci.payment_status,
          cl.full_name AS cliente_nombre,
          cl.phone AS cliente_phone,
          cl.email AS cliente_email
        FROM citas ci
        LEFT JOIN users cl ON cl.id = ci.cliente_id
        WHERE ci.abogado_id = ${auth.userId}
          AND ci.tenant_id = ${auth.tenantId}
          ${desde ? sql`AND ci.scheduled_at >= ${desde}` : sql``}
          ${hasta ? sql`AND ci.scheduled_at <= ${hasta}` : sql``}
        ORDER BY ci.scheduled_at ASC
      `;
    } else {
      // ADMIN_TENANT, SOPORTE_ADMIN, SUPERADMIN
      citas = await sql`
        SELECT
          ci.id, ci.type, ci.status, ci.scheduled_at,
          ci.duration_minutes, ci.google_meet_link,
          ci.price, ci.payment_status,
          ab.full_name AS abogado_nombre,
          cl.full_name AS cliente_nombre
        FROM citas ci
        LEFT JOIN users ab ON ab.id = ci.abogado_id
        LEFT JOIN users cl ON cl.id = ci.cliente_id
        WHERE ci.tenant_id = ${auth.tenantId}
          ${desde ? sql`AND ci.scheduled_at >= ${desde}` : sql``}
          ${hasta ? sql`AND ci.scheduled_at <= ${hasta}` : sql``}
        ORDER BY ci.scheduled_at ASC
      `;
    }

    return c.json({ success: true, data: citas });
  } catch (error) {
    console.error("GET /v1/citas error:", error);
    return c.json({ success: false, error: "Error al obtener citas" }, 500);
  }
});

/**
 * POST /v1/citas
 * CLIENTE o cualquier usuario puede solicitar una cita.
 */
citasRouter.post("/", authMiddleware, async (c) => {
  const auth = c.get("auth");
  const { abogado_id, type, scheduled_at, duration_minutes } = await c.req.json();

  if (!abogado_id || !type || !scheduled_at) {
    return c.json({ success: false, error: "abogado_id, type y scheduled_at son requeridos" }, 400);
  }

  try {
    const [cita] = await sql`
      INSERT INTO citas (
        tenant_id, abogado_id, cliente_id,
        type, status, scheduled_at, duration_minutes
      )
      VALUES (
        ${auth.tenantId}, ${abogado_id}, ${auth.userId},
        ${type}, 'pendiente', ${scheduled_at}, ${duration_minutes ?? 30}
      )
      RETURNING *
    `;
    return c.json({ success: true, data: cita }, 201);
  } catch (error) {
    console.error("POST /v1/citas error:", error);
    return c.json({ success: false, error: "Error al crear la cita" }, 500);
  }
});

/**
 * PATCH /v1/citas/:id/status
 * Cambia el estado de la cita. Solo ABOGADO o admin del tenant.
 */
citasRouter.patch(
  "/:id/status",
  authMiddleware,
  requireRole(["ABOGADO", "ADMIN_TENANT", "SOPORTE_ADMIN", "SUPERADMIN"]),
  async (c) => {
    const { id } = c.req.param();
    const { status } = await c.req.json();

    const allowed = ["pendiente", "confirmada", "cancelada", "realizada"];
    if (!allowed.includes(status)) {
      return c.json({ success: false, error: `Status inválido. Valores: ${allowed.join(", ")}` }, 400);
    }

    try {
      const [updated] = await sql`
        UPDATE citas SET status = ${status}, updated_at = NOW()
        WHERE id = ${id}
        RETURNING id, status, scheduled_at
      `;
      if (!updated) return c.json({ success: false, error: "Cita no encontrada" }, 404);
      return c.json({ success: true, data: updated });
    } catch (error) {
      console.error("PATCH /v1/citas/:id/status error:", error);
      return c.json({ success: false, error: "Error al actualizar cita" }, 500);
    }
  }
);
