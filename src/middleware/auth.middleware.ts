import { verifyToken } from "@clerk/backend";
import type { Context, Next } from "hono";

export type AuthPayload = {
  userId: string;
  role: string;
  tenantId: string | null;
  sessionId: string;
};

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthPayload;
  }
}

/**
 * Middleware de autenticación: verifica el JWT emitido por Clerk.
 * Extrae userId, role y tenantId de los claims del token.
 * Rechaza con 401 si el token es inválido o está vencido.
 */
export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ success: false, error: "Token de autorización requerido" }, 401);
  }

  const token = authHeader.slice(7);

  try {
    const tokenPayload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    const publicMetadata = tokenPayload.metadata as Record<string, unknown> | undefined;
    const userId = (publicMetadata?.db_user_id as string) ?? tokenPayload.sub;
    const role = (publicMetadata?.role as string) ?? "CLIENTE";
    const tenantId = (publicMetadata?.tenant_id as string) ?? null;

    c.set("auth", {
      userId,
      role,
      tenantId,
      sessionId: tokenPayload.sid ?? "",
    });

    await next();
  } catch {
    return c.json({ success: false, error: "Token inválido o expirado" }, 401);
  }
}
