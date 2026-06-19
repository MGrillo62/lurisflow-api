import { Hono } from "hono";
import { sql } from "../db/index.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/rbac.middleware.js";

export const adminRouter = new Hono();

/**
 * GET /v1/admin/dashboard
 * Stats del tenant: casos activos, citas del mes, ingresos, usuarios.
 * Solo ADMIN_TENANT, SOPORTE_ADMIN y SUPERADMIN.
 */
adminRouter.get(
  "/dashboard",
  authMiddleware,
  requireRole(["ADMIN_TENANT", "SOPORTE_ADMIN", "SUPERADMIN"]),
  async (c) => {
    const auth = c.get("auth");
    const tenantId = auth.tenantId;

    try {
      const [stats] = await sql`
        SELECT
          (SELECT COUNT(*) FROM casos WHERE tenant_id = ${tenantId} AND status = 'activo') AS casos_activos,
          (SELECT COUNT(*) FROM citas WHERE tenant_id = ${tenantId}
            AND scheduled_at >= date_trunc('month', NOW())
            AND scheduled_at < date_trunc('month', NOW()) + interval '1 month'
          ) AS citas_este_mes,
          (SELECT COUNT(*) FROM users WHERE tenant_id = ${tenantId} AND role = 'CLIENTE' AND is_active = true) AS clientes_activos,
          (SELECT COUNT(*) FROM users WHERE tenant_id = ${tenantId} AND role = 'ABOGADO' AND is_active = true) AS abogados_activos,
          (SELECT COALESCE(SUM(amount), 0) FROM transacciones
            WHERE tenant_id = ${tenantId} AND status = 'completada'
            AND created_at >= date_trunc('month', NOW())
          ) AS ingresos_mes
      `;
      return c.json({ success: true, data: stats });
    } catch (error) {
      console.error("GET /v1/admin/dashboard error:", error);
      return c.json({ success: false, error: "Error al obtener dashboard" }, 500);
    }
  }
);

/**
 * GET /v1/admin/usuarios
 * Lista de usuarios del tenant con filtros.
 */
adminRouter.get(
  "/usuarios",
  authMiddleware,
  requireRole(["ADMIN_TENANT", "SOPORTE_ADMIN", "SUPERADMIN"]),
  async (c) => {
    const auth = c.get("auth");
    const { role, is_active } = c.req.query();

    try {
      const usuarios = await sql`
        SELECT id, email, role, full_name, phone, profile_picture_url,
               is_active, created_at
        FROM users
        WHERE tenant_id = ${auth.tenantId}
          ${role ? sql`AND role = ${role}` : sql``}
          ${is_active !== undefined ? sql`AND is_active = ${is_active === "true"}` : sql``}
        ORDER BY full_name ASC
      `;
      return c.json({ success: true, data: usuarios });
    } catch (error) {
      console.error("GET /v1/admin/usuarios error:", error);
      return c.json({ success: false, error: "Error al obtener usuarios" }, 500);
    }
  }
);

/**
 * GET /v1/admin/tenants
 * Lista de todos los tenants. Solo SUPERADMIN.
 */
adminRouter.get(
  "/tenants",
  authMiddleware,
  requireRole(["SUPERADMIN"]),
  async (c) => {
    try {
      const tenants = await sql`
        SELECT id, name, subdomain, domain, logo_url, created_at,
               (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) AS total_usuarios
        FROM tenants t
        ORDER BY t.created_at DESC
      `;
      return c.json({ success: true, data: tenants });
    } catch (error) {
      console.error("GET /v1/admin/tenants error:", error);
      return c.json({ success: false, error: "Error al obtener tenants" }, 500);
    }
  }
);
