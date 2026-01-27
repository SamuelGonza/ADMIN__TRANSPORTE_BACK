import { Router, type Router as ExpressRouter } from "express";
import { PreliquidacionController } from "@/controllers/preliquidacion.controller";
import { ContabilidadAuth } from "@/auth/contabilidad.auth";
import { AdminAut } from "@/auth/admin.auth";

const router: ExpressRouter = Router();
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
 *     summary: Aprobar preliquidación (ADMIN)
 *     description: |
 *       Aprueba una preliquidación pendiente (solo ADMIN).
 *       - Marca liquidaciones como "liquidado_sin_pagar"
 *       - Genera cuentas de cobro para vehículos NO propios
 *       - Los gastos incluidos pasan a estado "liquidado"
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
router.post("/:id/approve", AdminAut, preliquidacionController.approve_preliquidacion.bind(preliquidacionController));

// Rechazar preliquidación
/**
 * @openapi
 * /preliquidacion/{id}/reject:
 *   post:
 *     tags: [Preliquidacion]
 *     summary: Rechazar preliquidación (ADMIN)
 *     description: |
 *       Rechaza una preliquidación pendiente (solo ADMIN).
 *       Los gastos vuelven a estado "no_liquidado".
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
router.post("/:id/reject", AdminAut, preliquidacionController.reject_preliquidacion.bind(preliquidacionController));

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
 *       Envía la preliquidación al cliente por email con el PDF adjunto.
 *       Puede enviarse en cualquier momento, independientemente del estado.
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

// Obtener vehículos y gastos al seleccionar servicios
/**
 * @openapi
 * /preliquidacion/vehicles-and-expenses:
 *   post:
 *     tags: [Preliquidacion]
 *     summary: Obtener vehículos y gastos operacionales al seleccionar servicios
 *     description: |
 *       Devuelve todos los vehículos de las solicitudes seleccionadas con su propietario
 *       y todos los gastos operacionales no liquidados de esos vehículos.
 *       Valida que las solicitudes estén facturadas.
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
 *                 description: Array de IDs de solicitudes
 *     responses:
 *       200:
 *         description: Vehículos y gastos obtenidos exitosamente
 *       400:
 *         description: Error de validación (solicitudes no facturadas)
 */
router.post("/vehicles-and-expenses", ContabilidadAuth, preliquidacionController.get_vehicles_and_expenses.bind(preliquidacionController));

// Listar preliquidaciones
/**
 * @openapi
 * /preliquidacion:
 *   get:
 *     tags: [Preliquidacion]
 *     summary: Listar preliquidaciones con paginación
 *     description: |
 *       Lista todas las preliquidaciones con paginación.
 *       Permite filtrar por estado.
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
 *         schema: { type: string, enum: [pendiente, aprobada, rechazada] }
 *         description: Filtrar por estado de la preliquidación
 *     responses:
 *       200:
 *         description: Preliquidaciones obtenidas correctamente
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
 *                     preliquidaciones:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id: { type: string }
 *                           numero: { type: string }
 *                           fecha: { type: string, format: date-time }
 *                           estado: { type: string }
 *                           total_preliquidacion: { type: number }
 *                           total_solicitudes: { type: number }
 *                           total_gastos_operacionales: { type: number }
 *                           total_gastos_preoperacionales: { type: number }
 *                           enviada_al_cliente: { type: boolean }
 *                           solicitudes_ids: { type: array }
 *                           created_by: { type: object }
 *                           aprobada_por: { type: object }
 *                           rechazada_por: { type: object }
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page: { type: number }
 *                         limit: { type: number }
 *                         total: { type: number }
 *                         totalPages: { type: number }
 */
router.get("/", ContabilidadAuth, preliquidacionController.list_preliquidaciones.bind(preliquidacionController));

export default router;
