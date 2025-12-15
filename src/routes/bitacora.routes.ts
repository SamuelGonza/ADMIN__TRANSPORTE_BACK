import { Router } from "express";
import { BitacoraController } from "@/controllers/bitacora.controller";
import { OperadorContabilidadAuth } from "@/auth/operador-contabilidad.auth";
import { CoordinadorAuth } from "@/auth/coordinador.auth";

const router: Router = Router();
const bitacoraController = new BitacoraController();

// #========== RUTAS PROTEGIDAS ==========#

// Obtener todas las bitácoras de la empresa
/**
 * @openapi
 * /bitacoras:
 *   get:
 *     tags: [Bitacoras]
 *     summary: Listar bitácoras de la empresa (coordinador+)
 *     description: |
 *       Obtiene las bitácoras de la empresa del usuario autenticado.
 *       Si se proporciona company_id en query, se usa ese; si no, se usa el company_id del token.
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: company_id
 *         schema: { type: string }
 *         description: ID de la compañía (opcional si el token tiene company_id)
 *       - in: query
 *         name: year
 *         schema: { type: string }
 *         description: Filtrar por año (ej: "2024")
 *       - in: query
 *         name: month
 *         schema: { type: string }
 *         description: Filtrar por mes (ej: "01", "02", etc.)
 *     responses:
 *       200:
 *         description: Bitácoras paginadas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     bitacoras: { type: array, items: { type: object } }
 *                     pagination: { type: object }
 *               required: [message, data]
 */
router.get("/", OperadorContabilidadAuth, bitacoraController.get_all_bitacoras.bind(bitacoraController));

// Obtener bitácora por ID
/**
 * @openapi
 * /bitacoras/{id}:
 *   get:
 *     tags: [Bitacoras]
 *     summary: Obtener bitácora por ID (coordinador+)
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Bitácora
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data: { type: object }
 *               required: [message, data]
 */
router.get("/:id", OperadorContabilidadAuth, bitacoraController.get_bitacora_by_id.bind(bitacoraController));

export default router;

