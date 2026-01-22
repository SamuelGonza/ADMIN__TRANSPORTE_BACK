import { Router } from "express";
import { PreliquidacionController } from "@/controllers/preliquidacion.controller";
import { ContabilidadAuth } from "@/auth/contabilidad.auth";

const router = Router();
const preliquidacionController = new PreliquidacionController();

// Generar preliquidación
/**
 * @openapi
 * /preliquidacion/generate:
 *   post:
 *     tags: [Preliquidacion]
 *     summary: Generar preliquidación en masa (contabilidad)
 *     description: |
 *       Genera una preliquidación para múltiples solicitudes facturadas y gastos seleccionados.
 *       El número se genera automáticamente con el formato: PRELIQ_MULTI_{HE_PRIMERA}-{HE_ULTIMA}_{NOMBRE_CLIENTE}
 *       
 *       Requiere que:
 *       - Todas las solicitudes estén facturadas (accounting_status: "facturado")
 *       - Todas las solicitudes pertenezcan al mismo cliente
 *       - Los gastos estén en estado "no_liquidado"
 *       
 *       Cálculo: (Suma total_a_pagar de solicitudes) - (Suma gastos Op + PreOp) = Preliquidación
 *     security:
 *       - sessionCookie: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [solicitudes_ids]
 *             properties:
 *               solicitudes_ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array de IDs de solicitudes a incluir en la preliquidación
 *                 minItems: 1
 *               gastos_operacionales_ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array de IDs de gastos operacionales a incluir (opcional)
 *               gastos_preoperacionales_ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array de IDs de gastos preoperacionales a incluir (opcional)
 *     responses:
 *       200:
 *         description: Preliquidación generada exitosamente
 *       400:
 *         description: Error de validación
 *       404:
 *         description: Solicitudes o gastos no encontrados
 */
router.post("/generate", ContabilidadAuth, preliquidacionController.generate_preliquidacion.bind(preliquidacionController));

// Aprobar preliquidación
/**
 * @openapi
 * /preliquidacion/{id}/approve:
 *   post:
 *     tags: [Preliquidacion]
 *     summary: Aprobar preliquidación (contabilidad)
 *     description: |
 *       Aprueba una preliquidación pendiente. Los gastos incluidos pasan a estado "liquidado".
 *       Las solicitudes quedan en estado "listo_para_liquidar".
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notas:
 *                 type: string
 *                 description: Notas adicionales sobre la aprobación
 *     responses:
 *       200:
 *         description: Preliquidación aprobada exitosamente
 *       400:
 *         description: La preliquidación ya está aprobada o rechazada
 *       404:
 *         description: Preliquidación no encontrada
 */
router.post("/:id/approve", ContabilidadAuth, preliquidacionController.approve_preliquidacion.bind(preliquidacionController));

// Rechazar preliquidación
/**
 * @openapi
 * /preliquidacion/{id}/reject:
 *   post:
 *     tags: [Preliquidacion]
 *     summary: Rechazar preliquidación (contabilidad)
 *     description: |
 *       Rechaza una preliquidación pendiente. Los gastos vuelven a estado "no_liquidado".
 *       Las solicitudes vuelven a estado "facturado".
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notas:
 *                 type: string
 *                 description: Notas sobre el rechazo
 *     responses:
 *       200:
 *         description: Preliquidación rechazada exitosamente
 *       400:
 *         description: La preliquidación ya está aprobada o rechazada
 *       404:
 *         description: Preliquidación no encontrada
 */
router.post("/:id/reject", ContabilidadAuth, preliquidacionController.reject_preliquidacion.bind(preliquidacionController));

// Descargar PDF de preliquidación
/**
 * @openapi
 * /preliquidacion/{id}/download-pdf:
 *   get:
 *     tags: [Preliquidacion]
 *     summary: Descargar PDF de preliquidación
 *     description: Genera y descarga el PDF de la preliquidación
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: PDF generado exitosamente
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Preliquidación no encontrada
 */
router.get("/:id/download-pdf", ContabilidadAuth, preliquidacionController.download_preliquidacion_pdf.bind(preliquidacionController));

// Enviar preliquidación al cliente
/**
 * @openapi
 * /preliquidacion/{id}/send-to-client:
 *   post:
 *     tags: [Preliquidacion]
 *     summary: Enviar preliquidación al cliente (contabilidad)
 *     description: |
 *       Envía la preliquidación aprobada al cliente por email con el PDF adjunto.
 *       Solo se pueden enviar preliquidaciones aprobadas.
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notas:
 *                 type: string
 *                 description: Notas adicionales para el cliente
 *     responses:
 *       200:
 *         description: Preliquidación enviada al cliente exitosamente
 *       400:
 *         description: La preliquidación no está aprobada o no tiene información de contacto
 *       404:
 *         description: Preliquidación no encontrada
 */
router.post("/:id/send-to-client", ContabilidadAuth, preliquidacionController.send_preliquidacion_to_client.bind(preliquidacionController));

// Obtener gastos pendientes (usando POST para enviar body con ids)
/**
 * @openapi
 * /preliquidacion/pending-expenses:
 *   post:
 *     tags: [Preliquidacion]
 *     summary: Obtener gastos pendientes de solicitudes
 *     description: Retorna los gastos operacionales y preoperacionales no liquidados de los vehículos asociados a las solicitudes.
 *     security:
 *       - sessionCookie: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [solicitudes_ids]
 *             properties:
 *               solicitudes_ids:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Gastos pendientes obtenidos exitosamente
 */
router.post("/pending-expenses", ContabilidadAuth, preliquidacionController.get_pending_expenses.bind(preliquidacionController));

export default router;
