import { Router } from "express";
import { SolicitudesController } from "@/controllers/solicitudes.controller";
import { ClienteAuth } from "@/auth/cliente.auth";
import { CoordinadorAuth } from "@/auth/coordinador.auth";
import { CoordinadoresAuth } from "@/auth/coordinadores.auth";
import { ComercialAuth } from "@/auth/comercial.auth";
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
 *       La bitácora se asigna AUTOMÁTICAMENTE según el mes y año ACTUAL (no la fecha del servicio).
 *       Si no existe una bitácora para el mes/año actual, se crea automáticamente.
 *       NO se debe enviar `bitacora_id` en el body - se ignora si se envía.
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
 *               fecha: { type: string, format: date-time, description: "Fecha del servicio" }
 *               hora_inicio: { type: string, example: "08:00", description: "Hora de inicio del servicio" }
 *               origen: { type: string, description: "Origen del servicio" }
 *               destino: { type: string, description: "Destino del servicio" }
 *               n_pasajeros: { type: number, description: "Número de pasajeros" }
 *               contacto: { type: string, description: "Opcional: nombre del contacto" }
 *               contacto_phone: { type: string, description: "Opcional: teléfono del contacto" }
 *               requested_passengers: { type: number, description: "Opcional: pasajeros solicitados (multi-vehículo)" }
 *               estimated_km: { type: number, description: "Opcional: kilómetros estimados" }
 *               estimated_hours: { type: number, description: "Opcional: horas estimadas" }
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
 *       El campo `he` se genera automáticamente como consecutivo por compañía.
 *     security:
 *       - sessionCookie: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               bitacora_id: { type: string, required: true }
 *               cliente_id: { type: string, required: true }
 *               empresa: { type: string, enum: [travel, national], required: true }
 *               fecha: { type: string, format: date-time, required: true }
 *               hora_inicio: { type: string, required: true }
 *               origen: { type: string, required: true }
 *               destino: { type: string, required: true }
 *               n_pasajeros: { type: number, required: true }
 *               placa: { type: string, required: true }
 *               conductor_id: { type: string, description: "Opcional: conductor del vehículo" }
 *               requested_passengers: { type: number }
 *               estimated_km: { type: number }
 *               estimated_hours: { type: number }
 *               contract_id: { type: string }
 *               contract_charge_mode: { type: string, enum: [within_contract, outside_contract, no_contract] }
 *               contract_charge_amount: { type: number }
 *               pricing_mode: { type: string, enum: [por_hora, por_kilometro, por_distancia, tarifa_amva, por_viaje, por_trayecto] }
 *             required: [bitacora_id, cliente_id, empresa, fecha, hora_inicio, origen, destino, n_pasajeros, placa]
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

// Iniciar servicio (solo coordinador operador)
/**
 * @openapi
 * /solicitudes/{id}/start:
 *   put:
 *     tags: [Solicitudes]
 *     summary: Iniciar servicio (coordinador operador)
 *     description: Solo el coordinador operador puede iniciar el servicio
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
router.put("/:id/start", CoordinadorAuth, solicitudesController.start_service.bind(solicitudesController));

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

// Buscar vehículos disponibles para cantidad de pasajeros
/**
 * @openapi
 * /solicitudes/find-vehicles:
 *   post:
 *     tags: [Solicitudes]
 *     summary: Buscar vehículos disponibles para cantidad de pasajeros
 *     description: |
 *       Busca vehículos disponibles para una cantidad de pasajeros en una fecha y hora específica.
 *       Devuelve vehículos disponibles y en servicio (con flag).
 *       Prioriza vehículos propios > afiliados > externos, luego por capacidad de asientos.
 *     security:
 *       - sessionCookie: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               requested_passengers:
 *                 type: number
 *                 description: Cantidad de pasajeros solicitados
 *                 example: 200
 *               fecha:
 *                 type: string
 *                 format: date-time
 *                 description: Fecha del servicio
 *                 example: "2024-12-15T00:00:00.000Z"
 *               hora_inicio:
 *                 type: string
 *                 description: Hora de inicio del servicio (formato HH:MM)
 *                 example: "08:00"
 *               vehicle_type:
 *                 type: string
 *                 description: Tipo de vehículo (opcional)
 *                 enum: [bus, buseta, buseton, camioneta, campero, micro, van]
 *             required: [requested_passengers, fecha, hora_inicio]
 *     responses:
 *       200:
 *         description: Lista de vehículos disponibles y en servicio
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     requested_passengers:
 *                       type: number
 *                     total_available_seats:
 *                       type: number
 *                     total_vehicles_needed:
 *                       type: number
 *                     remaining_passengers:
 *                       type: number
 *                     can_fulfill:
 *                       type: boolean
 *                     distribution:
 *                       type: array
 *                       items:
 *                         type: object
 *                     available_vehicles:
 *                       type: array
 *                       items:
 *                         type: object
 *                     in_service_vehicles:
 *                       type: array
 *                       items:
 *                         type: object
 */
router.post("/find-vehicles", CoordinadoresAuth, solicitudesController.find_vehicles_for_passengers.bind(solicitudesController));

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
 *       Nota: Los valores financieros NO se establecen aquí. El comercial debe usar PUT /solicitudes/:id/set-financial-values.
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
 *               empresa: { type: string, enum: [travel, national] }
 *               placa: { type: string, example: "ABC123" }
 *               conductor_id: { type: string, description: "Opcional: elegir conductor del listado del vehículo" }
 *               requested_passengers: { type: number }
 *               estimated_km: { type: number }
 *               estimated_hours: { type: number }
 *               contract_id: { type: string }
 *               contract_charge_mode: { type: string, enum: [within_contract, outside_contract, no_contract] }
 *               contract_charge_amount: { type: number }
 *               pricing_mode: { type: string, enum: [por_hora, por_kilometro, por_distancia, tarifa_amva, por_viaje, por_trayecto] }
 *             required: [empresa, placa]
 *     responses:
 *       200:
 *         description: Solicitud aceptada
 */
router.put("/:id/accept", CoordinadorAuth, solicitudesController.accept_solicitud.bind(solicitudesController));

// Establecer valores de venta (solo coordinador comercial)
/**
 * @openapi
 * /solicitudes/{id}/set-financial-values:
 *   put:
 *     tags: [Solicitudes]
 *     summary: Establecer valores de venta (coordinador comercial)
 *     description: |
 *       El coordinador comercial establece el valor a facturar al cliente (venta).
 *       La utilidad se calcula automáticamente si ya hay costos establecidos.
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
 *               valor_a_facturar: { type: number, description: "Valor a facturar al cliente (venta)" }
 *             required: [valor_a_facturar]
 *     responses:
 *       200:
 *         description: Valores de venta establecidos correctamente
 */
router.put("/:id/set-financial-values", ComercialAuth, solicitudesController.set_financial_values.bind(solicitudesController));

// Establecer valores de costos (solo coordinador operador)
/**
 * @openapi
 * /solicitudes/{id}/set-costs:
 *   put:
 *     tags: [Solicitudes]
 *     summary: Establecer valores de costos (coordinador operador)
 *     description: |
 *       El coordinador operador establece el valor a pagar al transportador (costos).
 *       La utilidad se calcula automáticamente si ya hay valores de venta establecidos.
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
 *               valor_cancelado: { type: number, description: "Valor a pagar al transportador (costos)" }
 *             required: [valor_cancelado]
 *     responses:
 *       200:
 *         description: Valores de costos establecidos correctamente
 */
router.put("/:id/set-costs", CoordinadorAuth, solicitudesController.set_costs.bind(solicitudesController));

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

// #========== RUTAS DE FLUJO DE CONTABILIDAD ==========#

// Verificar que todos los vehículos tienen operacional subido
/**
 * @openapi
 * /solicitudes/{id}/verify-operationals:
 *   get:
 *     tags: [Solicitudes]
 *     summary: Verificar operacionales completos (contabilidad)
 *     description: Verifica que todos los vehículos de la solicitud tengan operacional subido
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Estado de operacionales
 */
router.get("/:id/verify-operationals", ContabilidadAuth, solicitudesController.verify_operationals.bind(solicitudesController));

// Generar prefactura
/**
 * @openapi
 * /solicitudes/{id}/generate-prefactura:
 *   post:
 *     tags: [Solicitudes]
 *     summary: Generar prefactura (contabilidad)
 *     description: |
 *       Genera una prefactura para la solicitud. Requiere que:
 *       - Todos los vehículos tengan operacional subido
 *       - Valores de venta y costos estén definidos
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
 *               prefactura_numero: { type: string, description: "Número de la prefactura" }
 *             required: [prefactura_numero]
 *     responses:
 *       200:
 *         description: Prefactura generada
 */
router.post("/:id/generate-prefactura", ContabilidadAuth, solicitudesController.generate_prefactura.bind(solicitudesController));

// Aprobar prefactura
/**
 * @openapi
 * /solicitudes/{id}/approve-prefactura:
 *   put:
 *     tags: [Solicitudes]
 *     summary: Aprobar prefactura (contabilidad)
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notas: { type: string, description: "Notas opcionales" }
 *     responses:
 *       200:
 *         description: Prefactura aprobada
 */
router.put("/:id/approve-prefactura", ContabilidadAuth, solicitudesController.approve_prefactura.bind(solicitudesController));

// Rechazar prefactura
/**
 * @openapi
 * /solicitudes/{id}/reject-prefactura:
 *   put:
 *     tags: [Solicitudes]
 *     summary: Rechazar prefactura (contabilidad)
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notas: { type: string, description: "Notas opcionales" }
 *     responses:
 *       200:
 *         description: Prefactura rechazada
 */
router.put("/:id/reject-prefactura", ContabilidadAuth, solicitudesController.reject_prefactura.bind(solicitudesController));

// Marcar como lista para facturación
/**
 * @openapi
 * /solicitudes/{id}/mark-ready-for-billing:
 *   put:
 *     tags: [Solicitudes]
 *     summary: Marcar como lista para facturación (contabilidad)
 *     description: |
 *       Marca la solicitud como lista para facturación cuando se carga en el componente de facturación.
 *       Requiere que la prefactura esté aprobada.
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Solicitud marcada como lista para facturación
 */
router.put("/:id/mark-ready-for-billing", ContabilidadAuth, solicitudesController.mark_ready_for_billing.bind(solicitudesController));

// Enviar prefactura al cliente
/**
 * @openapi
 * /solicitudes/{id}/send-prefactura-to-client:
 *   post:
 *     tags: [Solicitudes]
 *     summary: Enviar prefactura al cliente (contabilidad)
 *     description: |
 *       Acepta la prefactura y la envía al cliente. Marca el estado como "aceptada" y registra el envío en el historial.
 *       Requiere que la prefactura esté aprobada.
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notas: { type: string, description: "Notas opcionales sobre el envío" }
 *     responses:
 *       200:
 *         description: Prefactura enviada al cliente
 *       400:
 *         description: Error de validación
 */
router.post("/:id/send-prefactura-to-client", ContabilidadAuth, solicitudesController.send_prefactura_to_client.bind(solicitudesController));

// Cambiar estado de prefactura
/**
 * @openapi
 * /solicitudes/{id}/change-prefactura-status:
 *   put:
 *     tags: [Solicitudes]
 *     summary: Cambiar estado de prefactura (contabilidad)
 *     description: |
 *       Permite cambiar el estado de la prefactura (aceptada/rechazada) y registrar el cambio en el historial.
 *       Esto permite reenviar la prefactura después de haberla enviado previamente.
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
 *               status: { type: string, enum: [aceptada, rechazada], description: "Estado a cambiar" }
 *               notas: { type: string, description: "Notas opcionales sobre el cambio" }
 *             required: [status]
 *     responses:
 *       200:
 *         description: Estado de prefactura actualizado
 *       400:
 *         description: Error de validación
 */
router.put("/:id/change-prefactura-status", ContabilidadAuth, solicitudesController.change_prefactura_status.bind(solicitudesController));

export default router;

