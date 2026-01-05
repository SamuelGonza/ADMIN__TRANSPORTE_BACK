import { Router } from "express";
import { PaymentSectionController } from "@/controllers/payment_section.controller";
import { GestionAuth } from "@/auth/gestion.auth";

const router: Router = Router();
const paymentSectionController = new PaymentSectionController();

// Obtener sección de pagos por solicitud
/**
 * @openapi
 * /payment-sections/solicitud/{solicitud_id}:
 *   get:
 *     tags: [PaymentSections]
 *     summary: Obtener sección de pagos por solicitud (gestión)
 *     description: |
 *       Obtiene la sección de pagos de una solicitud con todas las cuentas de cobro,
 *       conductores, vehículos y propietarios populizados.
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: solicitud_id
 *         required: true
 *         schema: { type: string }
 *         description: ID de la solicitud
 *     responses:
 *       200:
 *         description: Sección de pagos obtenida correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id: { type: string }
 *                     solicitud_id: { type: string }
 *                     company_id: { type: string }
 *                     cuentas_cobro:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           vehiculo_id: { type: object }
 *                           conductor_id: { type: object }
 *                           placa: { type: string }
 *                           propietario: { type: object }
 *                           valor_base: { type: number }
 *                           gastos_operacionales: { type: number }
 *                           gastos_preoperacionales: { type: number }
 *                           valor_final: { type: number }
 *                           estado: { type: string }
 *                     total_valor_base: { type: number }
 *                     total_gastos_operacionales: { type: number }
 *                     total_gastos_preoperacionales: { type: number }
 *                     total_valor_final: { type: number }
 *                     estado: { type: string }
 *               required: [message, data]
 *       404:
 *         description: No se encontró sección de pagos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/solicitud/:solicitud_id", GestionAuth, paymentSectionController.get_payment_section_by_solicitud.bind(paymentSectionController));

export default router;

