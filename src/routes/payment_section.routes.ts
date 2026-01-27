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

/**
 * @openapi
 * /payment-sections/{paymentSectionId}/cuenta-cobro/{vehiculoId}:
 *   put:
 *     tags: [PaymentSections]
 *     summary: Actualizar cuenta de cobro de un vehículo
 *     description: |
 *       Actualiza el valor_base (y opcionalmente gastos) de una cuenta de cobro específica
 *       de un vehículo dentro de una sección de pagos. Recalcula automáticamente el valor_final
 *       y los totales de la PaymentSection.
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: paymentSectionId
 *         required: true
 *         schema: { type: string }
 *         description: ID de la PaymentSection
 *       - in: path
 *         name: vehiculoId
 *         required: true
 *         schema: { type: string }
 *         description: ID del vehículo cuya cuenta de cobro se actualizará
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [solicitud_id, vehiculo_id, valor_base]
 *             properties:
 *               solicitud_id:
 *                 type: string
 *                 description: ID de la solicitud (para validación)
 *               vehiculo_id:
 *                 type: string
 *                 description: ID del vehículo (debe coincidir con el parámetro de ruta)
 *               valor_base:
 *                 type: number
 *                 description: Nuevo valor base a establecer (requerido, debe ser >= 0)
 *               gastos_operacionales:
 *                 type: number
 *                 description: Gastos operacionales (opcional, debe ser >= 0)
 *               gastos_preoperacionales:
 *                 type: number
 *                 description: Gastos preoperacionales (opcional, debe ser >= 0)
 *     responses:
 *       200:
 *         description: Cuenta de cobro actualizada correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   description: PaymentSection completo actualizado
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
 *                           placa: { type: string }
 *                           valor_base: { type: number }
 *                           gastos_operacionales: { type: number }
 *                           gastos_preoperacionales: { type: number }
 *                           valor_final: { type: number }
 *                     total_valor_base: { type: number }
 *                     total_gastos_operacionales: { type: number }
 *                     total_gastos_preoperacionales: { type: number }
 *                     total_valor_final: { type: number }
 *       400:
 *         description: Error de validación
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: PaymentSection o cuenta de cobro no encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put("/:paymentSectionId/cuenta-cobro/:vehiculoId", GestionAuth, paymentSectionController.update_cuenta_cobro.bind(paymentSectionController));

// Listar todas las cuentas de cobro con paginación
/**
 * @openapi
 * /payment-sections/cuentas-cobro:
 *   get:
 *     tags: [PaymentSections]
 *     summary: Listar todas las cuentas de cobro con paginación
 *     description: |
 *       Lista todas las cuentas de cobro de todos los PaymentSections con paginación.
 *       Permite filtrar por estado y flota.
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *         description: Número de página
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *         description: Cantidad de resultados por página
 *       - in: query
 *         name: estado
 *         schema: { type: string, enum: [pendiente, calculada, pagada, cancelada] }
 *         description: Filtrar por estado de la cuenta de cobro
 *       - in: query
 *         name: flota
 *         schema: { type: string, enum: [propio, afiliado, externo] }
 *         description: Filtrar por tipo de flota
 *     responses:
 *       200:
 *         description: Cuentas de cobro obtenidas correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     cuentas_cobro:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           vehiculo_id: { type: object }
 *                           placa: { type: string }
 *                           propietario: { type: object }
 *                           valor_base: { type: number }
 *                           gastos_operacionales: { type: number }
 *                           valor_final: { type: number }
 *                           estado: { type: string }
 *                           payment_section_id: { type: string }
 *                           solicitud: { type: object }
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page: { type: number }
 *                         limit: { type: number }
 *                         total: { type: number }
 *                         totalPages: { type: number }
 */
router.get("/cuentas-cobro", GestionAuth, paymentSectionController.list_cuentas_cobro.bind(paymentSectionController));

export default router;

