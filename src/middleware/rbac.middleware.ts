import type { Context, Next } from "hono";

type Role = "SUPERADMIN" | "ADMIN_TENANT" | "ABOGADO" | "SOPORTE_ADMIN" | "CLIENTE";

/**
 * Middleware de RBAC: verifica que el usuario autenticado
 * tiene uno de los roles permitidos para la ruta.
 * Usar DESPUÉS de authMiddleware.
 *
 * Ejemplo: app.get("/v1/admin/tenants", authMiddleware, requireRole(["SUPERADMIN"]), handler)
 */
export function requireRole(allowedRoles: Role[]) {
  return async (c: Context, next: Next) => {
    const auth = c.get("auth");
    if (!auth) {
      return c.json({ success: false, error: "No autenticado" }, 401);
    }
    if (!allowedRoles.includes(auth.role as Role)) {
      return c.json(
        {
          success: false,
          error: `Acceso denegado. Se requiere uno de los roles: ${allowedRoles.join(", ")}`,
        },
        403
      );
    }
    await next();
  };
}

/**
 * Middleware de tenant isolation: garantiza que el usuario
 * solo puede acceder a recursos de su propio tenant.
 * SUPERADMIN tiene acceso irrestricto.
 */
export function requireTenantAccess(c: Context, resourceTenantId: string): boolean {
  const auth = c.get("auth");
  if (!auth) return false;
  if (auth.role === "SUPERADMIN") return true;
  return auth.tenantId === resourceTenantId;
}
