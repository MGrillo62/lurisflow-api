import { Hono } from "hono";
import { sql } from "../db/index.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRole, requireTenantAccess } from "../middleware/rbac.middleware.js";

export const casosRouter = new Hono();

/**
 * GET /v1/casos
 * ABOGADO: ve los casos que tiene asignados en su tenant
 * CLIENTE: ve únicamente sus propios casos
 * ADMIN_TENANT / SOPORTE_ADMIN: ve todos los casos del tenant
 */
casosRouter.get("/", authMiddleware, async (c) => {
  const auth = c.get("auth");

  try {
    let casos;

    if (auth.role === "CLIENTE") {
      // Cliente solo ve sus propios casos
      casos = await sql`
        SELECT
          c.id, c.case_number, c.title, c.description,
          c.court_branch, c.status, c.start_date, c.end_date,
          c.created_at,
          u.full_name AS abogado_nombre,
          (
            SELECT json_agg(h ORDER BY h.event_date DESC)
            FROM caso_hitos h WHERE h.caso_id = c.id
          ) AS hitos
        FROM casos c
        LEFT JOIN users u ON u.id = c.abogado_responsable_id
        WHERE c.cliente_id = ${auth.userId}
          AND c.tenant_id = ${auth.tenantId}
        ORDER BY c.created_at DESC
      `;
    } else if (auth.role === "ABOGADO") {
      // Abogado ve los casos que lleva en su tenant
      casos = await sql`
        SELECT
          c.id, c.case_number, c.title, c.description,
          c.court_branch, c.status, c.start_date, c.end_date,
          c.created_at,
          u.full_name AS cliente_nombre
        FROM casos c
        LEFT JOIN users u ON u.id = c.cliente_id
        WHERE c.abogado_responsable_id = ${auth.userId}
          AND c.tenant_id = ${auth.tenantId}
        ORDER BY c.created_at DESC
      `;
    } else {
      // ADMIN_TENANT, SOPORTE_ADMIN, SUPERADMIN ven todos los casos del tenant
      const tenantFilter = auth.role === "SUPERADMIN"
        ? sql`1=1`
        : sql`c.tenant_id = ${auth.tenantId}`;

      casos = await sql`
        SELECT
          c.id, c.case_number, c.title, c.description,
          c.court_branch, c.status, c.start_date, c.end_date,
          c.created_at,
          ab.full_name AS abogado_nombre,
          cl.full_name AS cliente_nombre
        FROM casos c
        LEFT JOIN users ab ON ab.id = c.abogado_responsable_id
        LEFT JOIN users cl ON cl.id = c.cliente_id
        WHERE ${tenantFilter}
        ORDER BY c.created_at DESC
      `;
    }

    return c.json({ success: true, data: casos });
  } catch (error: any) {
    console.error("GET /v1/casos error:", error);
    return c.json({ success: false, error: `Error al obtener casos: ${error.message || error}` }, 500);
  }
});

/**
 * GET /v1/casos/:id
 * Detalle completo del caso con hitos y documentos.
 * El usuario debe pertenecer al mismo tenant y tener acceso al caso.
 */
casosRouter.get("/:id", authMiddleware, async (c) => {
  const auth = c.get("auth");
  const { id } = c.req.param();

  try {
    const [caso] = await sql`
      SELECT
        c.*,
        ab.full_name AS abogado_nombre,
        cl.full_name AS cliente_nombre,
        cl.email AS cliente_email,
        cl.phone AS cliente_phone,
        (
          SELECT json_agg(h ORDER BY h.event_date DESC)
          FROM caso_hitos h WHERE h.caso_id = c.id
        ) AS hitos,
        (
          SELECT json_agg(d ORDER BY d.created_at DESC)
          FROM caso_documentos d WHERE d.caso_id = c.id
        ) AS documentos
      FROM casos c
      LEFT JOIN users ab ON ab.id = c.abogado_responsable_id
      LEFT JOIN users cl ON cl.id = c.cliente_id
      WHERE c.id = ${id}
    `;

    if (!caso) {
      return c.json({ success: false, error: "Caso no encontrado" }, 404);
    }

    // Verificar que el usuario tiene acceso a este caso
    const hasAccess =
      auth.role === "SUPERADMIN" ||
      caso.tenant_id === auth.tenantId ||
      caso.cliente_id === auth.userId ||
      caso.abogado_responsable_id === auth.userId;

    if (!hasAccess) {
      return c.json({ success: false, error: "Sin acceso a este caso" }, 403);
    }

    return c.json({ success: true, data: caso });
  } catch (error) {
    console.error("GET /v1/casos/:id error:", error);
    return c.json({ success: false, error: "Error al obtener el caso" }, 500);
  }
});

/**
 * POST /v1/casos/:id/hitos
 * Agrega un hito cronológico al caso.
 * Solo ABOGADO, ADMIN_TENANT y SOPORTE_ADMIN pueden cargar hitos.
 */
casosRouter.post(
  "/:id/hitos",
  authMiddleware,
  requireRole(["ABOGADO", "ADMIN_TENANT", "SOPORTE_ADMIN", "SUPERADMIN"]),
  async (c) => {
    const auth = c.get("auth");
    const { id } = c.req.param();
    const { title, description, event_date } = await c.req.json();

    if (!title || !event_date) {
      return c.json({ success: false, error: "title y event_date son requeridos" }, 400);
    }

    try {
      // Verificar que el caso pertenece al tenant del usuario
      const [caso] = await sql`SELECT tenant_id FROM casos WHERE id = ${id}`;
      if (!caso || !requireTenantAccess(c, caso.tenant_id)) {
        return c.json({ success: false, error: "Caso no encontrado o sin acceso" }, 404);
      }

      const [hito] = await sql`
        INSERT INTO caso_hitos (caso_id, title, description, event_date)
        VALUES (${id}, ${title}, ${description ?? null}, ${event_date})
        RETURNING *
      `;

      return c.json({ success: true, data: hito }, 201);
    } catch (error) {
      console.error("POST /v1/casos/:id/hitos error:", error);
      return c.json({ success: false, error: "Error al agregar hito" }, 500);
    }
  }
);
