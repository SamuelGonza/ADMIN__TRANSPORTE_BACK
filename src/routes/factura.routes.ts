import { Router } from "express";
import { FacturaController } from "@/controllers/factura.controller";
import { GestionAuth } from "@/auth/gestion.auth";

const router: Router = Router();
const facturaController = new FacturaController();

/**
 * @openapi
 * /facturas/{id}:
 *   get:
 *     tags: [Facturacion]
 *     summary: Obtener factura por ID
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Factura encontrada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data: { type: object }
 */
router.get("/:id", GestionAuth, facturaController.get_factura_by_id.bind(facturaController));

export default router;
