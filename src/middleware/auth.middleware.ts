import { verifyToken, createClerkClient } from "@clerk/backend";
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

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

/**
 * Middleware de autenticación: verifica el JWT emitido por Clerk.
 * Extrae userId, role y tenantId de los claims del token o de la API de Clerk.
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

    let publicMetadata = tokenPayload.metadata as Record<string, unknown> | undefined;

    // Si la metadata no viene en el token JWT (comportamiento por defecto de Clerk
    // a menos que se configure una plantilla personalizada), consultamos directamente la API
    if (!publicMetadata || !publicMetadata.db_user_id) {
      console.log(`Buscando metadata en Clerk para el usuario: ${tokenPayload.sub}`);
      const clerkUser = await clerkClient.users.getUser(tokenPayload.sub);
      publicMetadata = clerkUser.publicMetadata as Record<string, unknown> | undefined;
    }

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
  } catch (err: any) {
    console.error("Auth middleware error:", err);
    return c.json({ success: false, error: "Token inválido o expirado" }, 401);
  }
}
