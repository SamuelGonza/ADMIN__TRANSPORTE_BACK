import { Router } from "express";
import { FacturaController } from "@/controllers/factura.controller";
import { GestionClienteAuth } from "@/auth/gestion-cliente.auth";

const router: Router = Router();
const facturaController = new FacturaController();

/**
 * @openapi
 * /facturas/{id}:
 *   get:
 *     tags: [Facturacion]
 *     summary: Obtener factura por ID (gestión y clientes)
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
router.get("/:id", GestionClienteAuth, facturaController.get_factura_by_id.bind(facturaController));

export default router;
