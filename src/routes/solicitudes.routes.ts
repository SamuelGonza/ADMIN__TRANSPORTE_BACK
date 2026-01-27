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
import { AdminAut } from "@/auth/admin.auth";
import { upload } from "@/middlewares/multer.middleware";

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
 *       
 *       **IMPORTANTE**: La selección del contrato es responsabilidad del **coordinador comercial**.
 *       Use PUT /solicitudes/:id/set-financial-values para seleccionar contrato y establecer valores de venta.
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
 *     summary: Confirmar asignación multi-vehículo (coordinador operador)
 *     description: |
 *       El coordinador operador asigna múltiples vehículos y conductores a la solicitud.
 *       
 *       **IMPORTANTE**: La selección del contrato es responsabilidad del **coordinador comercial**.
 *       Use PUT /solicitudes/:id/set-financial-values para seleccionar contrato y establecer valores de venta.
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
 *     summary: Aceptar solicitud pendiente (coordinador operador)
 *     description: |
 *       Acepta una solicitud `pending` y asigna vehículo por `placa` (y opcionalmente conductor).
 *       
 *       **IMPORTANTE**: La selección del contrato es responsabilidad del **coordinador comercial**.
 *       Use PUT /solicitudes/:id/set-financial-values para seleccionar contrato y establecer valores de venta.
 *       
 *       El coordinador operador solo asigna vehículos y conductores.
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
 *               pricing_mode: { type: string, enum: [por_hora, por_kilometro, por_distancia, tarifa_amva, por_viaje, por_trayecto] }
 *             required: [empresa, placa]
 *     responses:
 *       200:
 *         description: Solicitud aceptada
 */
router.put("/:id/accept", CoordinadorAuth, solicitudesController.accept_solicitud.bind(solicitudesController));

// Establecer valores de venta y contrato (solo coordinador comercial)
/**
 * @openapi
 * /solicitudes/{id}/set-financial-values:
 *   put:
 *     tags: [Solicitudes]
 *     summary: Establecer valores de venta y seleccionar contrato (coordinador comercial)
 *     description: |
 *       El coordinador comercial establece el valor a facturar al cliente (venta) y selecciona el contrato.
 *       La selección del contrato es responsabilidad del coordinador comercial.
 *       La utilidad se calcula automáticamente si ya hay costos establecidos.
 *       Si se selecciona contract_charge_mode = "within_contract", se carga automáticamente al contrato.
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
 *               contract_id: { type: string, description: "ID del contrato a utilizar (opcional)" }
 *               contract_charge_mode: { type: string, enum: [within_contract, outside_contract, no_contract], description: "Modo de cargo al contrato" }
 *               contract_charge_amount: { type: number, description: "Monto a cargar al contrato (por defecto usa valor_a_facturar)" }
 *             required: [valor_a_facturar]
 *     responses:
 *       200:
 *         description: Valores de venta y contrato establecidos correctamente
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
// Calcular liquidación final (SOLO ADMIN)
/**
 * @openapi
 * /solicitudes/{id}/calcular-liquidacion:
 *   post:
 *     tags: [Solicitudes]
 *     summary: Calcular liquidación final (SOLO ADMIN)
 *     description: |
 *       Calcula automáticamente la liquidación final del servicio.
 *       **IMPORTANTE**: Solo el administrador puede realizar la liquidación final.
 *       La preliquidación la realiza contabilidad, pero la liquidación final es exclusiva del admin.
 *       
 *       Calcula:
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
 *         description: Liquidación final calculada
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
router.post("/:id/calcular-liquidacion", AdminAut, solicitudesController.calcular_liquidacion.bind(solicitudesController));

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
 *       Genera una prefactura para la solicitud. El número se genera automáticamente con el formato:
 *       PREF_{CONSECUTIVO_SOLICITUD}_{NOMBRE_CLIENTE}
 *       
 *       Requiere que:
 *       - Valores de venta y costos estén definidos
 *       
 *       NOTA: Los operacionales NO son obligatorios - un bus puede no tener gastos operacionales
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
 *     responses:
 *       200:
 *         description: Prefactura generada exitosamente con número y fecha automáticos
 */
router.post("/:id/generate-prefactura", ContabilidadAuth, solicitudesController.generate_prefactura.bind(solicitudesController));

// Generar prefactura múltiple
/**
 * @openapi
 * /solicitudes/generate-prefactura-multiple:
 *   post:
 *     tags: [Solicitudes]
 *     summary: Generar prefactura para múltiples solicitudes del mismo cliente (contabilidad)
 *     description: |
 *       Genera una prefactura compartida para múltiples solicitudes del mismo cliente.
 *       Todas las solicitudes compartirán el mismo número de prefactura con el formato:
 *       PREF_MULTI_{HE_PRIMERA}-{HE_ULTIMA}_{NOMBRE_CLIENTE}
 *       
 *       Requiere que:
 *       - Todas las solicitudes pertenezcan al mismo cliente
 *       - Valores de venta y costos estén definidos en todas las solicitudes
 *       - Ninguna solicitud tenga prefactura ya generada
 *       
 *       NOTA: Los operacionales NO son obligatorios - un bus puede no tener gastos operacionales
 *     security:
 *       - sessionCookie: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [solicitud_ids]
 *             properties:
 *               solicitud_ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array de IDs de solicitudes a incluir en la prefactura
 *                 minItems: 1
 *     responses:
 *       200:
 *         description: Prefactura generada exitosamente para todas las solicitudes
 *       400:
 *         description: Error de validación (solicitudes de diferentes clientes, ya tienen prefactura, etc.)
 *       404:
 *         description: Una o más solicitudes no encontradas
 */
router.post("/generate-prefactura-multiple", ContabilidadAuth, solicitudesController.generate_prefactura_multiple.bind(solicitudesController));

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
// Aprobar prefactura
/**
 * @openapi
 * /solicitudes/{id}/approve-prefactura:
 *   put:
 *     tags: [Solicitudes]
 *     summary: Aprobar prefactura (contabilidad)
 *     description: |
 *       Aprueba la prefactura y automáticamente marca como "listo_para_facturacion".
 *       Si la prefactura ya está aprobada, use reenviar=true para permitir reenvío al cliente.
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
 *               reenviar: { type: boolean, description: "Si es true y ya está aprobada, permite reenviar al cliente" }
 *     responses:
 *       200:
 *         description: Prefactura aprobada o lista para reenviar
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

// Descargar PDF de prefactura
/**
 * @openapi
 * /solicitudes/{id}/prefactura-pdf:
 *   get:
 *     tags: [Solicitudes]
 *     summary: Descargar PDF de prefactura
 *     description: Descarga el PDF de la prefactura generada para una solicitud
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: ID de la solicitud
 *     responses:
 *       200:
 *         description: PDF de prefactura
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: No existe prefactura generada
 *       404:
 *         description: Solicitud no encontrada
 */
router.get("/:id/prefactura-pdf", ContabilidadAuth, solicitudesController.download_prefactura_pdf.bind(solicitudesController));

// Marcar como lista para facturación (DEPRECADO - Se hace automáticamente al aprobar prefactura)
/**
 * @openapi
 * /solicitudes/{id}/mark-ready-for-billing:
 *   put:
 *     tags: [Solicitudes]
 *     summary: [DEPRECADO] Marcar como lista para facturación (contabilidad)
 *     description: |
 *       ⚠️ DEPRECADO: Este endpoint está deprecado. 
 *       Al aprobar la prefactura, automáticamente se marca como "listo_para_facturacion".
 *       Use PUT /solicitudes/{id}/approve-prefactura en su lugar.
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
 *       400:
 *         description: Endpoint deprecado - use approve-prefactura
 */
router.put("/:id/mark-ready-for-billing", ContabilidadAuth, solicitudesController.mark_ready_for_billing.bind(solicitudesController));

// Enviar prefactura al cliente
/**
 * @openapi
 * /solicitudes/{id}/send-prefactura-to-client:
 *   post:
 *     tags: [Solicitudes]
 *     summary: Enviar o reenviar prefactura al cliente (contabilidad)
 *     description: |
 *       Genera el PDF de la prefactura y lo envía por correo al cliente.
 *       Permite reenviar la prefactura en cualquier momento después de haberla generado.
 *       No requiere que la prefactura esté aprobada, solo que exista una prefactura generada.
 *       Cada envío se registra en el historial de envíos.
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: ID de la solicitud
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
 *         description: Prefactura enviada al cliente exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { type: string }
 *                     solicitud: { type: object }
 *       400:
 *         description: Error de validación (prefactura no generada, cliente sin email, etc.)
 *       404:
 *         description: Solicitud no encontrada
 *       500:
 *         description: Error al generar PDF o enviar correo
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

// Reenviar correos de solicitud completa
/**
 * @openapi
 * /solicitudes/{id}/resend-emails-to-drivers:
 *   post:
 *     tags: [Solicitudes]
 *     summary: Reenviar correos a los conductores asignados
 *     description: |
 *       Reenvía los correos con manifiesto de pasajeros a todos los conductores asignados a la solicitud.
 *       Solo funciona si la solicitud tiene vehículos y conductores asignados.
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: ID de la solicitud
 *     responses:
 *       200:
 *         description: Correos reenviados exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 message: { type: string }
 *       400:
 *         description: Error de validación (no hay conductores asignados, sin email, etc.)
 *       404:
 *         description: Solicitud no encontrada
 *       500:
 *         description: Error al reenviar correos
 */
router.post("/:id/resend-emails-to-drivers", GestionAuth, solicitudesController.resend_emails_to_drivers.bind(solicitudesController));

/**
 * @openapi
 * /solicitudes/{id}/resend-email-to-client:
 *   post:
 *     tags: [Solicitudes]
 *     summary: Reenviar correo al cliente
 *     description: |
 *       Reenvía el correo al cliente con todos los documentos:
 *       - Hojas de vida de conductores
 *       - SOATs de vehículos
 *       - Licencias de conducción
 *       - Licencias de tránsito
 *       - Fichas técnicas de vehículos
 *       Solo funciona si la solicitud tiene vehículos y conductores asignados.
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: ID de la solicitud
 *     responses:
 *       200:
 *         description: Correo reenviado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 message: { type: string }
 *       400:
 *         description: Error de validación (no hay vehículos asignados, cliente sin email, etc.)
 *       404:
 *         description: Solicitud no encontrada
 *       500:
 *         description: Error al reenviar correo
 */
router.post("/:id/resend-email-to-client", GestionAuth, solicitudesController.resend_email_to_client.bind(solicitudesController));

// Descargar plantilla Excel para gastos operacionales
/**
 * @openapi
 * /solicitudes/operational-bills-template:
 *   get:
 *     tags: [Solicitudes]
 *     summary: Descargar plantilla Excel para gastos operacionales (contabilidad)
 *     description: |
 *       Descarga una plantilla Excel con el formato requerido para subir gastos operacionales.
 *       La plantilla incluye columnas: Tipo de Gasto, Valor, Descripción, Placa del Vehículo.
 *       Incluye filas de ejemplo para referencia.
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
 *       500:
 *         description: Error al generar plantilla
 */
router.get("/operational-bills-template", ContabilidadAuth, solicitudesController.download_operational_bills_template.bind(solicitudesController));

// Subir Excel con gastos operacionales
/**
 * @openapi
 * /solicitudes/operational-bills-excel:
 *   post:
 *     tags: [Solicitudes]
 *     summary: Subir Excel con gastos operacionales (contabilidad)
 *     description: |
 *       Sube un archivo Excel con gastos operacionales de múltiples vehículos.
 *       Los gastos se crean sin vincular a ninguna solicitud y se marcan como "no_liquidado".
 *       
 *       El Excel debe tener las siguientes columnas:
 *       - Tipo de Gasto: fuel, tolls, repairs, fines, parking_lot
 *       - Valor: número positivo
 *       - Descripción: texto descriptivo
 *       - Placa del Vehículo: placa del vehículo (se busca automáticamente)
 *       
 *       El sistema procesará automáticamente:
 *       1. Leerá todas las filas del Excel
 *       2. Buscará los vehículos por placa
 *       3. Creará los registros de gastos operacionales para cada vehículo con estado "no_liquidado"
 *     security:
 *       - sessionCookie: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               excel:
 *                 type: string
 *                 format: binary
 *                 description: Archivo Excel (.xls o .xlsx)
 *             required: [excel]
 *     responses:
 *       200:
 *         description: Excel procesado exitosamente
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
 *                     total_vehiculos: { type: number }
 *                     exitosos: { type: number }
 *                     errores: { type: number }
 *                     detalles:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           placa: { type: string }
 *                           vehiculo_id: { type: string }
 *                           gastos_registrados: { type: number }
 *                           error: { type: string }
 *       400:
 *         description: Error de validación (archivo inválido, formato incorrecto, etc.)
 *       500:
 *         description: Error al procesar Excel
 */
router.post(
    "/operational-bills-excel",
    ContabilidadAuth,
    upload.single('excel'),
    solicitudesController.upload_operational_bills_excel.bind(solicitudesController)
);

// Exportar solicitudes a Excel
/**
 * @openapi
 * /solicitudes/export/excel:
 *   get:
 *     tags: [Solicitudes]
 *     summary: Exportar solicitudes a Excel
 *     description: |
 *       Exporta solicitudes a Excel. Puede exportar todas las solicitudes o solo las de una bitácora específica.
 *       Incluye todos los campos de la solicitud, información del cliente (incluyendo documento), vehículos, conductores,
 *       valores financieros, y campos de auditoría (quien creó, aprobó, asignó vehículos, etc.).
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: query
 *         name: bitacora_id
 *         schema: { type: string }
 *         description: Opcional: ID de la bitácora para exportar solo sus solicitudes
 *       - in: query
 *         name: cliente_id
 *         schema: { type: string }
 *         description: Opcional: Filtrar por cliente
 *       - in: query
 *         name: conductor_id
 *         schema: { type: string }
 *         description: Opcional: Filtrar por conductor
 *       - in: query
 *         name: vehiculo_id
 *         schema: { type: string }
 *         description: Opcional: Filtrar por vehículo
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, accepted, rejected] }
 *         description: Opcional: Filtrar por estado
 *       - in: query
 *         name: service_status
 *         schema: { type: string }
 *         description: Opcional: Filtrar por estado de servicio
 *       - in: query
 *         name: empresa
 *         schema: { type: string, enum: [travel, national] }
 *         description: Opcional: Filtrar por empresa
 *       - in: query
 *         name: fecha_inicio
 *         schema: { type: string, format: date }
 *         description: Opcional: Fecha de inicio del rango
 *       - in: query
 *         name: fecha_fin
 *         schema: { type: string, format: date }
 *         description: Opcional: Fecha de fin del rango
 *     responses:
 *       200:
 *         description: Archivo Excel descargado
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *       500:
 *         description: Error al exportar
 */
router.get("/export/excel", OperadorContabilidadAuth, solicitudesController.export_solicitudes_to_excel.bind(solicitudesController));

// Aprobar prefactura por el cliente
/**
 * @openapi
 * /solicitudes/{id}/client/approve-prefactura:
 *   put:
 *     tags: [Solicitudes]
 *     summary: Aprobar prefactura (cliente)
 *     description: |
 *       Permite al cliente aprobar la prefactura. SOLO el cliente asociado a la solicitud puede aprobarla.
 *       Al aprobar, automáticamente marca como "listo_para_facturacion".
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: ID de la solicitud
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
 *         description: Prefactura aprobada exitosamente
 *       403:
 *         description: No tiene permiso (solo el cliente asociado puede aprobar)
 *       404:
 *         description: Solicitud no encontrada
 */
router.put("/:id/client/approve-prefactura", ClienteAuth, solicitudesController.client_approve_prefactura.bind(solicitudesController));

// Descargar PDF de prefactura (cliente)
/**
 * @openapi
 * /solicitudes/{id}/client/prefactura-pdf:
 *   get:
 *     tags: [Solicitudes]
 *     summary: Descargar PDF de prefactura (cliente)
 *     description: |
 *       Permite al cliente descargar el PDF de la prefactura. 
 *       SOLO el cliente asociado a la solicitud puede descargarla.
 *       La prefactura debe haber sido enviada al cliente previamente.
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: ID de la solicitud
 *     responses:
 *       200:
 *         description: PDF de prefactura
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: No existe prefactura generada o no ha sido enviada al cliente
 *       403:
 *         description: No tiene permiso (solo el cliente asociado puede descargar)
 *       404:
 *         description: Solicitud no encontrada
 */
router.get("/:id/client/prefactura-pdf", ClienteAuth, solicitudesController.client_download_prefactura_pdf.bind(solicitudesController));

// Rechazar prefactura por el cliente
/**
 * @openapi
 * /solicitudes/{id}/client/reject-prefactura:
 *   put:
 *     tags: [Solicitudes]
 *     summary: Rechazar prefactura (cliente)
 *     description: |
 *       Permite al cliente rechazar la prefactura. SOLO el cliente asociado a la solicitud puede rechazarla.
 *       Al rechazar, vuelve a estado "operacional_completo" para que se pueda regenerar la prefactura.
 *       **IMPORTANTE**: La justificación (notas) es OBLIGATORIA al rechazar la prefactura.
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: ID de la solicitud
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [notas]
 *             properties:
 *               notas: { type: string, description: "Justificación obligatoria para el rechazo" }
 *     responses:
 *       200:
 *         description: Prefactura rechazada exitosamente
 *       403:
 *         description: No tiene permiso (solo el cliente asociado puede rechazar)
 *       404:
 *         description: Solicitud no encontrada
 */
router.put("/:id/client/reject-prefactura", ClienteAuth, solicitudesController.client_reject_prefactura.bind(solicitudesController));

// #========== RUTAS DE CONTRATOS DE VENTA Y COMPRA ==========#

// Actualizar datos del servicio (hora_final, kilometros_reales) - RECALCULA AUTOMÁTICAMENTE
/**
 * @openapi
 * /solicitudes/{id}/datos-servicio:
 *   put:
 *     tags: [Solicitudes]
 *     summary: Actualizar datos del servicio (RECALCULA TODO AUTOMÁTICAMENTE)
 *     description: |
 *       Permite actualizar la hora_final y los kilometros_reales del servicio.
 *       
 *       **IMPORTANTE**: Al actualizar estos valores, el sistema RECALCULA AUTOMÁTICAMENTE:
 *       - El valor de todos los contratos de COMPRA (pago a vehículos) que usen por_hora o por_kilometro
 *       - El valor del contrato de VENTA (cobro al cliente) si usa por_hora o por_kilometro
 *       - La utilidad y porcentaje de utilidad
 *       
 *       No es necesario llamar a ningún endpoint de "recalcular".
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: ID de la solicitud
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               hora_final: { type: string, example: "18:30", description: "Hora de finalización del servicio" }
 *               kilometros_reales: { type: number, example: 415, description: "Kilómetros reales viajados" }
 *     responses:
 *       200:
 *         description: Datos actualizados y todos los contratos recalculados automáticamente
 */
router.put("/:id/datos-servicio", CoordinadoresAuth, solicitudesController.update_datos_servicio.bind(solicitudesController));

// Establecer contrato de venta (solo coordinador comercial)
/**
 * @openapi
 * /solicitudes/{id}/contrato-venta:
 *   put:
 *     tags: [Solicitudes]
 *     summary: Establecer contrato de VENTA (coordinador comercial)
 *     description: |
 *       El coordinador comercial establece el contrato de venta que define cuánto se le cobra al cliente.
 *       
 *       **Flujo:**
 *       1. Seleccionar el contrato del cliente
 *       2. Elegir el modo de cobro (por_hora, por_kilometro, por_distancia, por_viaje, por_trayecto)
 *       3. El sistema calcula automáticamente el valor_a_facturar basado en:
 *          - Por hora: tarifa_hora × total_horas
 *          - Por kilómetro: tarifa_km × kilometros_reales
 *          - Por distancia/viaje/trayecto: tarifa fija
 *       
 *       **Notas:**
 *       - Se puede sobrescribir el cálculo con valor_manual si usar_valor_manual = true
 *       - También se puede actualizar hora_final y kilometros_reales en la misma llamada
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
 *             required: [contract_id, pricing_mode]
 *             properties:
 *               contract_id: { type: string, description: "ID del contrato del cliente" }
 *               pricing_mode: { type: string, enum: [por_hora, por_kilometro, por_distancia, por_viaje, por_trayecto], description: "Modo de cobro" }
 *               cantidad: { type: number, description: "Opcional: cantidad manual (si no se proporciona, se calcula automáticamente)" }
 *               valor_manual: { type: number, description: "Opcional: valor manual para sobrescribir el cálculo" }
 *               usar_valor_manual: { type: boolean, description: "Si true, usar valor_manual en vez del cálculo" }
 *               notas: { type: string, description: "Notas opcionales" }
 *               hora_final: { type: string, description: "Opcional: actualizar hora_final del servicio" }
 *               kilometros_reales: { type: number, description: "Opcional: actualizar kilómetros reales" }
 *     responses:
 *       200:
 *         description: Contrato de venta establecido exitosamente
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
 *                     solicitud: { type: object }
 *                     calculo:
 *                       type: object
 *                       properties:
 *                         pricing_mode: { type: string }
 *                         tarifa: { type: number }
 *                         cantidad: { type: number }
 *                         valor_calculado: { type: number }
 *                         valor_manual: { type: number }
 *                         usar_valor_manual: { type: boolean }
 *                         valor_final: { type: number }
 */
router.put("/:id/contrato-venta", ComercialAuth, solicitudesController.set_contrato_venta.bind(solicitudesController));

// Establecer contrato de compra por vehículo (solo coordinador operador)
/**
 * @openapi
 * /solicitudes/{id}/vehiculo/{vehiculo_id}/contrato-compra:
 *   put:
 *     tags: [Solicitudes]
 *     summary: Establecer contrato de COMPRA por vehículo (coordinador operador)
 *     description: |
 *       El coordinador operador establece el contrato de compra que define cuánto se le paga a cada vehículo.
 *       
 *       **Flujo:**
 *       1. Seleccionar el contrato del vehículo/propietario
 *       2. Elegir el modo de pago (por_hora, por_kilometro, por_distancia, por_viaje, por_trayecto)
 *       3. El sistema calcula automáticamente el valor a pagar basado en:
 *          - Por hora: tarifa_hora × total_horas (de la solicitud)
 *          - Por kilómetro: tarifa_km × kilometros_reales (de la solicitud)
 *          - Por distancia/viaje/trayecto: tarifa fija
 *       
 *       **Notas:**
 *       - Se puede sobrescribir el cálculo con valor_manual si usar_valor_manual = true
 *       - El valor_cancelado de la solicitud se actualiza automáticamente (suma de todos los vehículos)
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: ID de la solicitud
 *       - in: path
 *         name: vehiculo_id
 *         required: true
 *         schema: { type: string }
 *         description: ID del vehículo en vehicle_assignments
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [contract_id, pricing_mode]
 *             properties:
 *               contract_id: { type: string, description: "ID del contrato del vehículo/propietario" }
 *               pricing_mode: { type: string, enum: [por_hora, por_kilometro, por_distancia, por_viaje, por_trayecto], description: "Modo de pago" }
 *               cantidad: { type: number, description: "Opcional: cantidad manual (si no se proporciona, hereda de la solicitud)" }
 *               valor_manual: { type: number, description: "Opcional: valor manual para sobrescribir el cálculo" }
 *               usar_valor_manual: { type: boolean, description: "Si true, usar valor_manual en vez del cálculo" }
 *               notas: { type: string, description: "Notas opcionales" }
 *     responses:
 *       200:
 *         description: Contrato de compra del vehículo establecido exitosamente
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
 *                     solicitud: { type: object }
 *                     vehiculo:
 *                       type: object
 *                       properties:
 *                         vehiculo_id: { type: string }
 *                         placa: { type: string }
 *                         contrato_compra: { type: object }
 *                     calculo:
 *                       type: object
 *                       properties:
 *                         pricing_mode: { type: string }
 *                         tarifa: { type: number }
 *                         cantidad: { type: number }
 *                         valor_calculado: { type: number }
 *                         valor_final: { type: number }
 *                     totales:
 *                       type: object
 *                       properties:
 *                         valor_cancelado_total: { type: number }
 *                         valor_a_facturar: { type: number }
 *                         utilidad: { type: number }
 *                         porcentaje_utilidad: { type: number }
 */
router.put("/:id/vehiculo/:vehiculo_id/contrato-compra", CoordinadorAuth, solicitudesController.set_contrato_compra_vehiculo.bind(solicitudesController));

// Obtener resumen de contratos de una solicitud
/**
 * @openapi
 * /solicitudes/{id}/contratos-resumen:
 *   get:
 *     tags: [Solicitudes]
 *     summary: Obtener resumen de contratos de una solicitud
 *     description: |
 *       Obtiene un resumen completo de los contratos de venta y compra de una solicitud.
 *       Incluye datos del servicio, contrato de venta (lo que se cobra al cliente),
 *       contratos de compra por vehículo (lo que se paga a cada vehículo), y totales.
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Resumen de contratos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     solicitud_id: { type: string }
 *                     datos_servicio:
 *                       type: object
 *                       properties:
 *                         total_horas: { type: number }
 *                         kilometros_reales: { type: number }
 *                         hora_inicio: { type: string }
 *                         hora_final: { type: string }
 *                         fecha: { type: string }
 *                         fecha_final: { type: string }
 *                     contrato_venta:
 *                       type: object
 *                       description: Contrato de venta (lo que se cobra al cliente)
 *                     contratos_compra:
 *                       type: array
 *                       items:
 *                         type: object
 *                       description: Contratos de compra por vehículo
 *                     totales:
 *                       type: object
 *                       properties:
 *                         valor_a_facturar: { type: number }
 *                         valor_cancelado: { type: number }
 *                         utilidad: { type: number }
 *                         porcentaje_utilidad: { type: number }
 */
router.get("/:id/contratos-resumen", CoordinadoresAuth, solicitudesController.get_contratos_resumen.bind(solicitudesController));

export default router;

