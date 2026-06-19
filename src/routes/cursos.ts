import { Hono } from "hono";
import { sql } from "../db/index.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/rbac.middleware.js";

export const cursosRouter = new Hono();

/**
 * GET /v1/cursos
 * Lista de cursos publicados del tenant.
 * Accesible por todos los roles autenticados.
 */
cursosRouter.get("/", authMiddleware, async (c) => {
  const auth = c.get("auth");
  const { category, access_type } = c.req.query();

  try {
    const cursos = await sql`
      SELECT
        cu.id, cu.title, cu.slug, cu.description,
        cu.category, cu.access_type, cu.price, cu.status,
        cu.thumbnail_url, cu.scheduled_start, cu.scheduled_end,
        cu.profesor_name, cu.duration_text, cu.modality,
        cu.dias_dictado, cu.horario,
        -- Si el usuario está inscrito
        (
          SELECT i.status FROM inscripciones i
          WHERE i.curso_id = cu.id AND i.user_id = ${auth.userId}
          LIMIT 1
        ) AS inscripcion_status
      FROM cursos cu
      WHERE cu.tenant_id = ${auth.tenantId}
        AND cu.status = 'publicado'
        ${category ? sql`AND cu.category = ${category}` : sql``}
        ${access_type ? sql`AND cu.access_type = ${access_type}` : sql``}
      ORDER BY cu.created_at DESC
    `;
    return c.json({ success: true, data: cursos });
  } catch (error) {
    console.error("GET /v1/cursos error:", error);
    return c.json({ success: false, error: "Error al obtener cursos" }, 500);
  }
});

/**
 * GET /v1/cursos/:slug
 * Detalle del curso con materiales (si el usuario está inscrito).
 */
cursosRouter.get("/:slug", authMiddleware, async (c) => {
  const auth = c.get("auth");
  const { slug } = c.req.param();

  try {
    const [curso] = await sql`
      SELECT * FROM cursos
      WHERE slug = ${slug} AND tenant_id = ${auth.tenantId} AND status = 'publicado'
    `;
    if (!curso) return c.json({ success: false, error: "Curso no encontrado" }, 404);

    // Verificar inscripción para acceso a materiales pagados
    const [inscripcion] = await sql`
      SELECT * FROM inscripciones
      WHERE curso_id = ${curso.id} AND user_id = ${auth.userId}
    `;

    const tieneAcceso =
      curso.access_type === "gratuito" ||
      !!inscripcion ||
      ["ADMIN_TENANT", "SUPERADMIN", "ABOGADO"].includes(auth.role);

    return c.json({
      success: true,
      data: {
        ...curso,
        inscripcion: inscripcion ?? null,
        tiene_acceso: tieneAcceso,
        // Solo devolver video_url si tiene acceso
        video_url: tieneAcceso ? curso.video_url : null,
        pdf_url: tieneAcceso ? curso.pdf_url : null,
      },
    });
  } catch (error) {
    console.error("GET /v1/cursos/:slug error:", error);
    return c.json({ success: false, error: "Error al obtener curso" }, 500);
  }
});

/**
 * POST /v1/cursos/:id/inscribir
 * Inscribe al usuario autenticado en el curso.
 */
cursosRouter.post("/:id/inscribir", authMiddleware, async (c) => {
  const auth = c.get("auth");
  const { id } = c.req.param();

  try {
    const [curso] = await sql`SELECT id, access_type, price FROM cursos WHERE id = ${id}`;
    if (!curso) return c.json({ success: false, error: "Curso no encontrado" }, 404);

    const [inscripcion] = await sql`
      INSERT INTO inscripciones (curso_id, user_id, status)
      VALUES (${id}, ${auth.userId}, 'activo')
      ON CONFLICT (curso_id, user_id) DO NOTHING
      RETURNING *
    `;

    return c.json({
      success: true,
      data: inscripcion ?? { message: "Ya estás inscrito en este curso" },
    }, 201);
  } catch (error) {
    console.error("POST /v1/cursos/:id/inscribir error:", error);
    return c.json({ success: false, error: "Error al inscribir" }, 500);
  }
});
