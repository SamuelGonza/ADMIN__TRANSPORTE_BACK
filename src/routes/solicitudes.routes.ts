import { Router } from "express";
import { SolicitudesController } from "@/controllers/solicitudes.controller";
import { ClienteAuth } from "@/auth/cliente.auth";
import { CoordinadorAuth } from "@/auth/coordinador.auth";
import { GestionAuth } from "@/auth/gestion.auth";
import { OperadorAuth } from "@/auth/operador.auth";
import { ContabilidadAuth } from "@/auth/contabilidad.auth";
import { ConductorAuth } from "@/auth/conductor.auth";
import { ReportsDownloadAuth } from "@/auth/reports-download.auth";
import { OperadorContabilidadAuth } from "@/auth/operador-contabilidad.auth";

const router: Router = Router();
const solicitudesController = new SolicitudesController();

// #========== RUTAS PROTEGIDAS ==========#

// Crear solicitud como cliente
/**
 * @openapi
 * /solicitudes/client:
 *   post:
 *     tags: [Solicitudes]
 *     summary: Crear solicitud (cliente)
 *     description: |
 *       Crea una solicitud en estado `pending`. El `client_id` se toma del token del cliente.
 *       La bitácora se busca automáticamente según el mes y año de la fecha del servicio.
 *       Si no existe una bitácora para ese mes/año, se crea automáticamente.
 *       Body mínimo: fecha, hora_inicio, origen, destino, n_pasajeros.
 *     security:
 *       - sessionCookie: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               bitacora_id: 
 *                 type: string
 *                 description: Opcional. Si se proporciona, se usa esa bitácora. Si no, se busca/crea automáticamente según la fecha.
 *               fecha: { type: string, format: date-time }
 *               hora_inicio: { type: string, example: "08:00" }
 *               origen: { type: string }
 *               destino: { type: string }
 *               n_pasajeros: { type: number }
 *               requested_passengers: { type: number }
 *               estimated_km: { type: number }
 *               estimated_hours: { type: number }
 *             required: [fecha, hora_inicio, origen, destino, n_pasajeros]
 *     responses:
 *       201:
 *         description: Solicitud creada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 */
router.post("/client", ClienteAuth, solicitudesController.create_solicitud_client.bind(solicitudesController));

// Crear solicitud como coordinador (ya aprobada)
/**
 * @openapi
 * /solicitudes/coordinator:
 *   post:
 *     tags: [Solicitudes]
 *     summary: Crear solicitud (gestión/coordinador) - ya aceptada
 *     description: |
 *       Crea una solicitud en estado `accepted` y asigna vehículo/conductor.
 *     security:
 *       - sessionCookie: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       201:
 *         description: Solicitud creada y aprobada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 */
router.post("/coordinator", OperadorContabilidadAuth, solicitudesController.create_solicitud_coordinator.bind(solicitudesController));

// Obtener todas las solicitudes (coordinador+)
/**
 * @openapi
 * /solicitudes:
 *   get:
 *     tags: [Solicitudes]
 *     summary: Listar solicitudes (coordinador+)
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
 *         name: bitacora_id
 *         schema: { type: string }
 *       - in: query
 *         name: cliente_id
 *         schema: { type: string }
 *       - in: query
 *         name: conductor_id
 *         schema: { type: string }
 *       - in: query
 *         name: vehiculo_id
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, accepted, rejected] }
 *       - in: query
 *         name: service_status
 *         schema: { type: string, enum: [not-started, started, finished] }
 *       - in: query
 *         name: empresa
 *         schema: { type: string, enum: [travel, national] }
 *       - in: query
 *         name: fecha_inicio
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: fecha_fin
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Solicitudes paginadas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data: { type: object }
 *               required: [message, data]
 */
router.get("/", OperadorContabilidadAuth, solicitudesController.get_all_solicitudes.bind(solicitudesController));

// #========== RUTAS DEL CLIENTE ==========#

// Obtener mis solicitudes como cliente
/**
 * @openapi
 * /solicitudes/my-requests:
 *   get:
 *     tags: [Solicitudes]
 *     summary: Mis solicitudes (cliente)
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
 *         name: status
 *         schema: { type: string, enum: [pending, accepted, rejected] }
 *       - in: query
 *         name: service_status
 *         schema: { type: string, enum: [not-started, started, finished] }
 *       - in: query
 *         name: fecha_inicio
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: fecha_fin
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Lista paginada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data: { type: object }
 *               required: [message, data]
 */
router.get("/my-requests", ClienteAuth, solicitudesController.get_client_solicitudes.bind(solicitudesController));

// Obtener detalle de mi solicitud como cliente
/**
 * @openapi
 * /solicitudes/my-requests/{id}:
 *   get:
 *     tags: [Solicitudes]
 *     summary: Detalle de mi solicitud (cliente)
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Solicitud
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data: { type: object }
 *               required: [message, data]
 */
router.get("/my-requests/:id", ClienteAuth, solicitudesController.get_client_solicitud_by_id.bind(solicitudesController));

// #========== RUTAS DEL CONDUCTOR ==========#

// Obtener mis solicitudes asignadas (conductor)
/**
 * @openapi
 * /solicitudes/my-services:
 *   get:
 *     tags: [Solicitudes]
 *     summary: Mis servicios asignados (conductor)
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
 *         name: service_status
 *         schema: { type: string, enum: [not-started, started, finished] }
 *       - in: query
 *         name: fecha_inicio
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: fecha_fin
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Lista paginada
 */
router.get("/my-services", ConductorAuth, solicitudesController.get_my_solicitudes.bind(solicitudesController));

// Obtener detalle de mi solicitud asignada (conductor)
/**
 * @openapi
 * /solicitudes/my-services/{id}:
 *   get:
 *     tags: [Solicitudes]
 *     summary: Detalle de servicio asignado (conductor)
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Solicitud
 */
router.get("/my-services/:id", ConductorAuth, solicitudesController.get_my_solicitud_by_id.bind(solicitudesController));

// Iniciar servicio (conductor)
/**
 * @openapi
 * /solicitudes/{id}/start:
 *   put:
 *     tags: [Solicitudes]
 *     summary: Iniciar servicio (conductor)
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Servicio iniciado
 */
router.put("/:id/start", ConductorAuth, solicitudesController.start_service.bind(solicitudesController));

// Finalizar servicio (conductor)
/**
 * @openapi
 * /solicitudes/{id}/finish:
 *   put:
 *     tags: [Solicitudes]
 *     summary: Finalizar servicio (conductor)
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               hora_final: { type: string, example: "12:30" }
 *               novedades: { type: string }
 *             required: [hora_final]
 *     responses:
 *       200:
 *         description: Servicio finalizado
 */
router.put("/:id/finish", ConductorAuth, solicitudesController.finish_service.bind(solicitudesController));

// #========== RUTAS DE COORDINADOR ==========#

// Previsualizar vehículo por placa (antes de asignar)
/**
 * @openapi
 * /solicitudes/vehicle/preview/{placa}:
 *   get:
 *     tags: [Solicitudes]
 *     summary: Previsualizar vehículo por placa
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: placa
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Info del vehículo + conductor + propietario
 */
router.get("/vehicle/preview/:placa", CoordinadorAuth, solicitudesController.preview_vehicle_by_placa.bind(solicitudesController));

// Sugerir asignación multi-vehículo (plan temporal)
/**
 * @openapi
 * /solicitudes/{id}/suggest-vehicles:
 *   post:
 *     tags: [Solicitudes]
 *     summary: Sugerir asignación multi-vehículo (sin persistir)
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               requested_passengers: { type: number }
 *               preferred_seats: { type: number }
 *               vehicle_type: { type: string }
 *             required: [requested_passengers]
 *     responses:
 *       200:
 *         description: Plan sugerido
 */
router.post("/:id/suggest-vehicles", CoordinadorAuth, solicitudesController.suggest_vehicle_allocation.bind(solicitudesController));

// Confirmar asignación multi-vehículo (persistir)
/**
 * @openapi
 * /solicitudes/{id}/assign-vehicles:
 *   put:
 *     tags: [Solicitudes]
 *     summary: Confirmar asignación multi-vehículo (persistir)
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               requested_passengers: { type: number }
 *               assignments:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     vehiculo_id: { type: string }
 *                     conductor_id: { type: string }
 *                     assigned_passengers: { type: number }
 *                     contract_id: { type: string }
 *                     contract_charge_mode: { type: string, enum: [within_contract, outside_contract, no_contract] }
 *                     contract_charge_amount: { type: number }
 *                   required: [vehiculo_id, conductor_id, assigned_passengers]
 *             required: [requested_passengers, assignments]
 *     responses:
 *       200:
 *         description: Asignación guardada
 */
router.put("/:id/assign-vehicles", CoordinadorAuth, solicitudesController.assign_multiple_vehicles.bind(solicitudesController));

// Obtener solicitud por ID
/**
 * @openapi
 * /solicitudes/{id}:
 *   get:
 *     tags: [Solicitudes]
 *     summary: Obtener solicitud por ID (coordinador)
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Solicitud
 */
router.get("/:id", OperadorContabilidadAuth, solicitudesController.get_solicitud_by_id.bind(solicitudesController));

// Descargar PDF manifiesto de pasajeros (individual)
/**
 * @openapi
 * /solicitudes/{id}/passenger-manifest-pdf:
 *   get:
 *     tags: [Solicitudes]
 *     summary: Descargar manifiesto de pasajeros (PDF)
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: PDF generado
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get("/:id/passenger-manifest-pdf", ReportsDownloadAuth, solicitudesController.download_passenger_manifest_pdf.bind(solicitudesController));

// Aceptar solicitud pendiente (ahora usa placa en lugar de vehiculo_id)
/**
 * @openapi
 * /solicitudes/{id}/accept:
 *   put:
 *     tags: [Solicitudes]
 *     summary: Aceptar solicitud pendiente (coordinador)
 *     description: |
 *       Acepta una solicitud `pending` y asigna vehículo por `placa` (y opcionalmente conductor).
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               he: { type: string }
 *               empresa: { type: string, enum: [travel, national] }
 *               placa: { type: string, example: "ABC123" }
 *               conductor_id: { type: string, description: "Opcional: elegir conductor del listado del vehículo" }
 *               nombre_cuenta_cobro: { type: string }
 *               valor_cancelado: { type: number }
 *               valor_a_facturar: { type: number }
 *               utilidad: { type: number }
 *               porcentaje_utilidad: { type: number }
 *               requested_passengers: { type: number }
 *               estimated_km: { type: number }
 *               estimated_hours: { type: number }
 *               contract_id: { type: string }
 *               contract_charge_mode: { type: string, enum: [within_contract, outside_contract, no_contract] }
 *               contract_charge_amount: { type: number }
 *               pricing_mode: { type: string, enum: [por_hora, por_kilometro, por_distancia, tarifa_amva] }
 *             required: [he, empresa, placa, nombre_cuenta_cobro, valor_cancelado, valor_a_facturar, utilidad, porcentaje_utilidad]
 *     responses:
 *       200:
 *         description: Solicitud aceptada
 */
router.put("/:id/accept", CoordinadorAuth, solicitudesController.accept_solicitud.bind(solicitudesController));

// Rechazar solicitud pendiente
/**
 * @openapi
 * /solicitudes/{id}/reject:
 *   put:
 *     tags: [Solicitudes]
 *     summary: Rechazar solicitud (coordinador)
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Solicitud rechazada
 */
router.put("/:id/reject", CoordinadorAuth, solicitudesController.reject_solicitud.bind(solicitudesController));

// Actualizar datos financieros
/**
 * @openapi
 * /solicitudes/{id}/financial:
 *   put:
 *     tags: [Solicitudes]
 *     summary: Actualizar datos financieros (contabilidad)
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               doc_soporte: { type: string }
 *               fecha_cancelado: { type: string, format: date-time }
 *               n_egreso: { type: string }
 *               n_factura: { type: string }
 *               fecha_factura: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Datos actualizados
 */
// Calcular liquidación automática
/**
 * @openapi
 * /solicitudes/{id}/calcular-liquidacion:
 *   post:
 *     tags: [Solicitudes]
 *     summary: Calcular liquidación automática (contabilidad)
 *     description: |
 *       Calcula automáticamente la liquidación del servicio:
 *       - Total Gastos Operacionales = Suma de gastos vinculados a la solicitud
 *       - Utilidad = valor_a_facturar - valor_cancelado - total_gastos_operacionales
 *       - Porcentaje Utilidad = (utilidad / valor_a_facturar) * 100
 *       - Valor Documento Equivalente = utilidad (si no está definido)
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Liquidación calculada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     valor_a_facturar: { type: number }
 *                     valor_cancelado: { type: number }
 *                     total_gastos_operacionales: { type: number }
 *                     total_gastos: { type: number }
 *                     utilidad: { type: number }
 *                     porcentaje_utilidad: { type: number }
 *                     valor_documento_equivalente: { type: number }
 */
router.post("/:id/calcular-liquidacion", ContabilidadAuth, solicitudesController.calcular_liquidacion.bind(solicitudesController));

router.put("/:id/financial", ContabilidadAuth, solicitudesController.update_financial_data.bind(solicitudesController));

// Actualizar contabilidad por bus asignado (contrato por bus)
/**
 * @openapi
 * /solicitudes/{id}/vehicle/{vehiculo_id}/accounting:
 *   put:
 *     tags: [Solicitudes]
 *     summary: Actualizar contabilidad por bus asignado (contabilidad)
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: vehiculo_id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       200:
 *         description: Contabilidad actualizada
 */
router.put("/:id/vehicle/:vehiculo_id/accounting", ContabilidadAuth, solicitudesController.update_assignment_accounting.bind(solicitudesController));

export default router;

