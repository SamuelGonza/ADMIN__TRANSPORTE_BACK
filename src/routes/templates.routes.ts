import { Router } from "express";
import { TemplatesController } from "@/controllers/templates.controller";
import { SessionAuth } from "@/auth/session.auth";

const router: Router = Router();
const templatesController = new TemplatesController();

/**
 * @openapi
 * /templates/operational-expenses:
 *   get:
 *     tags: [Templates]
 *     summary: Descargar plantilla de gastos operacionales
 *     description: Descarga la plantilla Excel para gastos operacionales
 *     security:
 *       - sessionCookie: []
 *     responses:
 *       200:
 *         description: Archivo Excel descargado
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Plantilla no encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: No autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
    "/operational-expenses",
    SessionAuth,
    templatesController.download_operational_expenses_template.bind(templatesController)
);

export default router;
