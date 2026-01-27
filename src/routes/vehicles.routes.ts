import { Router } from "express";
import { VehiclesController } from "@/controllers/vehicles.controller";
import { AdminAut } from "@/auth/admin.auth";
import { CoordinadorAuth } from "@/auth/coordinador.auth";
import { OperadorAuth } from "@/auth/operador.auth";
import { upload } from "@/middlewares/multer.middleware";
import { SuperAdminAut } from "@/auth/superadmon.auth";
import { ContabilidadAuth } from "@/auth/contabilidad.auth";
import { SessionAuth } from "@/auth/session.auth";
import { VehicleWriteAuth } from "@/auth/vehicle-write.auth";
import { ReportsDownloadAuth } from "@/auth/reports-download.auth";
import { OperadorContabilidadAuth } from "@/auth/operador-contabilidad.auth";

const router: Router = Router();
const vehiclesController = new VehiclesController();

// #========== RUTAS PROTEGIDAS ==========#

// Crear nuevo vehículo
/**
 * @openapi
 * /vehicles:
 *   post:
 *     tags: [Vehicles]
 *     summary: Crear vehículo (admin/coordinador/comercia)
 *     description: |
 *       Crea un vehículo. Solo admin, coordinador y comercia pueden crear vehículos.
 *       Soporta imagen `picture` (multipart/form-data).
 *       `company_id` es opcional si el token ya trae company_id.
 *     security:
 *       - sessionCookie: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               company_id: { type: string }
 *               driver_id: { type: string }
 *               possible_drivers:
 *                 type: array
 *                 items: { type: string }
 *               n_numero_interno: { type: string }
 *               placa: { type: string, example: "ABC123" }
 *               name: { type: string }
 *               description: { type: string }
 *               seats: { type: number, example: 40 }
 *               type: { type: string, example: "bus" }
 *               flota: { type: string }
 *               owner_id: { type: object, description: "Owner: {type: 'Company', company_id} o {type:'User', user_id}" }
 *               technical_sheet: { type: object }
 *               picture: { type: string, format: binary }
 *             required: [driver_id, placa, seats, type, flota, owner_id]
 *     responses:
 *       201:
 *         description: Vehículo creado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 */
router.post(
    "/",
    VehicleWriteAuth,
    upload.single("picture"),
    vehiclesController.create_vehicle.bind(vehiclesController)
);

// Crear reporte preoperacional (conductor)
/**
 * @openapi
 * /vehicles/preoperational:
 *   post:
 *     tags: [Vehicles]
 *     summary: Crear reporte preoperacional (operador/contabilidad/coordinador)
 *     description: |
 *       Enviar `vehicle_id`, `driver_id` (se ignora si el token es conductor), y `reports`.
 *       `reports` puede venir como JSON o string JSON.
 *
 *       Archivos: upload.any() admite nombres dinámicos tipo `reports[0][media]`, `reports[1][media]`, etc.
 *     security:
 *       - sessionCookie: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               vehicle_id: { type: string }
 *               driver_id: { type: string }
 *               reports:
 *                 oneOf:
 *                   - type: string
 *                     description: "String JSON: [{description,status,media?}]"
 *                   - type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         description: { type: string }
 *                         status: { type: string, enum: [ok, details, failures] }
 *             required: [vehicle_id, reports]
 *     responses:
 *       201:
 *         description: Reporte creado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 */
router.post(
    "/preoperational",
    OperadorContabilidadAuth,
    upload.any(), // Permite múltiples archivos con nombres dinámicos
    vehiclesController.create_preoperational_report.bind(vehiclesController)
);

// Registrar gastos operacionales
/**
 * @openapi
 * /vehicles/operational-bills:
 *   post:
 *     tags: [Vehicles]
 *     summary: Registrar gastos operacionales (operador/contabilidad/coordinador)
 *     description: |
 *       Enviar `vehicle_id`, `user_id` (opcional; el backend puede usar el usuario autenticado), `solicitud_id` (opcional para vincular gastos a una solicitud), y `bills`.
 *       `bills` puede venir como JSON o string JSON.
 *
 *       Si se proporciona `solicitud_id`, los gastos se vincularán a la solicitud y se recalculará automáticamente la liquidación.
 *
 *       Archivos: nombres dinámicos tipo `bills[0][media_support]`.
 *     security:
 *       - sessionCookie: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               vehicle_id: { type: string }
 *               user_id: { type: string }
 *               solicitud_id: { type: string, description: "Opcional: ID de la solicitud para vincular gastos" }
 *               bills:
 *                 oneOf:
 *                   - type: string
 *                     description: "String JSON: [{type_bill,value,description,media_support?}]"
 *                   - type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         type_bill: { type: string, enum: [fuel, tolls, repairs, fines, parking_lot] }
 *                         value: { type: number }
 *                         description: { type: string }
 *             required: [vehicle_id, bills]
 *     responses:
 *       201:
 *         description: Gastos registrados
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 */
router.post(
    "/operational-bills",
    OperadorContabilidadAuth,
    upload.any(), // Permite múltiples archivos con nombres dinámicos
    vehiclesController.create_operational_bills.bind(vehiclesController)
);

// Obtener todos los vehículos
/**
 * @openapi
 * /vehicles:
 *   get:
 *     tags: [Vehicles]
 *     summary: Listar vehículos (todos los usuarios)
 *     description: Permite a todos los usuarios autenticados consultar todos los vehículos del sistema.
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
 *         name: placa
 *         schema: { type: string }
 *       - in: query
 *         name: type
 *         schema: { type: string }
 *       - in: query
 *         name: name
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Vehículos paginados
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     vehicles: { type: array, items: { type: object } }
 *                     pagination: { $ref: '#/components/schemas/VehiclesPagination' }
 *               required: [message, data]
 */
router.get("/", SessionAuth, vehiclesController.get_all_vehicles.bind(vehiclesController));

// Obtener vehículos por compañía
/**
 * @openapi
 * /vehicles/company:
 *   get:
 *     tags: [Vehicles]
 *     summary: Listar vehículos por compañía (todos los usuarios)
 *     description: Usa `company_id` del token si existe, si no, se puede enviar por query. Todos los usuarios autenticados pueden consultar.
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: query
 *         name: company_id
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: placa
 *         schema: { type: string }
 *       - in: query
 *         name: type
 *         schema: { type: string }
 *       - in: query
 *         name: name
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Vehículos paginados por compañía
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     vehicles: { type: array, items: { type: object } }
 *                     pagination: { $ref: '#/components/schemas/VehiclesPagination' }
 *               required: [message, data]
 */
router.get("/company", SessionAuth, vehiclesController.get_all_vehicles_by_company.bind(vehiclesController));
/**
 * @openapi
 * /vehicles/company/{company_id}:
 *   get:
 *     tags: [Vehicles]
 *     summary: Listar vehículos por compañía por path param (todos los usuarios)
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: company_id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: placa
 *         schema: { type: string }
 *       - in: query
 *         name: type
 *         schema: { type: string }
 *       - in: query
 *         name: name
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Vehículos paginados por compañía
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     vehicles: { type: array, items: { type: object } }
 *                     pagination: { $ref: '#/components/schemas/VehiclesPagination' }
 *               required: [message, data]
 */
router.get("/company/:company_id", SessionAuth, vehiclesController.get_all_vehicles_by_company.bind(vehiclesController));

// Obtener todos los vehículos con sus últimos reportes (operacional y preoperacional)
/**
 * @openapi
 * /vehicles/last-reports:
 *   get:
 *     tags: [Vehicles]
 *     summary: Vehículos con últimos reportes (todos los usuarios)
 *     description: Usa company_id del token o por query. Todos los usuarios autenticados pueden consultar.
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: query
 *         name: company_id
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
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
router.get("/last-reports", SessionAuth, vehiclesController.get_all_vehicles_last_reports.bind(vehiclesController));
/**
 * @openapi
 * /vehicles/last-reports/{company_id}:
 *   get:
 *     tags: [Vehicles]
 *     summary: Vehículos con últimos reportes por compañía (todos los usuarios)
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: company_id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
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
router.get("/last-reports/:company_id", SessionAuth, vehiclesController.get_all_vehicles_last_reports.bind(vehiclesController));

// Obtener vehículos por usuario
/**
 * @openapi
 * /vehicles/user/{user_id}:
 *   get:
 *     tags: [Vehicles]
 *     summary: Vehículos por usuario (todos los usuarios)
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: user_id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Lista de vehículos del usuario
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data: { type: array, items: { type: object } }
 *               required: [message, data]
 */
router.get("/user/:user_id", SessionAuth, vehiclesController.get_vehicles_by_user.bind(vehiclesController));

// Obtener documentos de un vehículo
/**
 * @openapi
 * /vehicles/{vehicle_id}/documents:
 *   get:
 *     tags: [Vehicles]
 *     summary: Obtener documentos del vehículo (todos los usuarios)
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: vehicle_id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Documentos del vehículo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data: { type: object }
 *               required: [message, data]
 */
router.get("/:vehicle_id/documents", SessionAuth, vehiclesController.get_vehicle_documents.bind(vehiclesController));

// Actualizar documentos de un vehículo + vencimientos
/**
 * @openapi
 * /vehicles/{vehicle_id}/documents:
 *   put:
 *     tags: [Vehicles]
 *     summary: Actualizar documentos del vehículo (admin/coordinador/comercia)
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: vehicle_id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               soat: { type: string, format: binary }
 *               tecnomecanica: { type: string, format: binary }
 *               seguro: { type: string, format: binary }
 *               licencia_transito: { type: string, format: binary }
 *               runt: { type: string, format: binary }
 *               soat_vencimiento: { type: string, format: date-time }
 *               tecnomecanica_vencimiento: { type: string, format: date-time }
 *               seguro_vencimiento: { type: string, format: date-time }
 *               tarjeta_operacion_vencimiento: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Documentos actualizados
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 */
router.put(
    "/:vehicle_id/documents",
    VehicleWriteAuth,
    upload.fields([
        { name: "soat", maxCount: 1 },
        { name: "tecnomecanica", maxCount: 1 },
        { name: "seguro", maxCount: 1 },
        { name: "licencia_transito", maxCount: 1 },
        { name: "runt", maxCount: 1 }
    ]),
    vehiclesController.update_vehicle_documents.bind(vehiclesController)
);

// Obtener operacionales de un vehículo (historial)
/**
 * @openapi
 * /vehicles/{vehicle_id}/operationals:
 *   get:
 *     tags: [Vehicles]
 *     summary: Historial de operacionales (todos los usuarios)
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: vehicle_id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Operacionales paginados
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data: { type: object }
 *               required: [message, data]
 */
router.get("/:vehicle_id/operationals", OperadorContabilidadAuth, vehiclesController.get_vehicle_operationals.bind(vehiclesController));

// Obtener preoperacionales de un vehículo (historial)
/**
 * @openapi
 * /vehicles/{vehicle_id}/preoperationals:
 *   get:
 *     tags: [Vehicles]
 *     summary: Historial de preoperacionales (todos los usuarios)
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: vehicle_id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Preoperacionales paginados
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data: { type: object }
 *               required: [message, data]
 */
router.get("/:vehicle_id/preoperationals", OperadorContabilidadAuth, vehiclesController.get_vehicle_preoperationals.bind(vehiclesController));

// Obtener último operacional de un vehículo
/**
 * @openapi
 * /vehicles/{vehicle_id}/last-operational:
 *   get:
 *     tags: [Vehicles]
 *     summary: Último operacional (todos los usuarios)
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: vehicle_id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Último operacional
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data: { type: object, nullable: true }
 *               required: [message, data]
 */
router.get("/:vehicle_id/last-operational", OperadorContabilidadAuth, vehiclesController.get_last_operational_by_vehicle.bind(vehiclesController));

// Obtener último preoperacional de un vehículo
/**
 * @openapi
 * /vehicles/{vehicle_id}/last-preoperational:
 *   get:
 *     tags: [Vehicles]
 *     summary: Último preoperacional (todos los usuarios)
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: vehicle_id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Último preoperacional
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data: { type: object, nullable: true }
 *               required: [message, data]
 */
router.get("/:vehicle_id/last-preoperational", OperadorContabilidadAuth, vehiclesController.get_last_preoperational_by_vehicle.bind(vehiclesController));

// Obtener vehículo por ID
/**
 * @openapi
 * /vehicles/{id}:
 *   get:
 *     tags: [Vehicles]
 *     summary: Obtener vehículo por ID (todos los usuarios)
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Vehículo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data: { type: object }
 *               required: [message, data]
 */
router.get("/:id", SessionAuth, vehiclesController.get_vehicle_by_id.bind(vehiclesController));

// Descargar ficha técnica del vehículo (PDF)
/**
 * @openapi
 * /vehicles/{id}/technical-sheet-pdf:
 *   get:
 *     tags: [Vehicles]
 *     summary: Descargar ficha técnica del vehículo (PDF) (todos los usuarios)
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
router.get("/:id/technical-sheet-pdf", ReportsDownloadAuth, vehiclesController.download_vehicle_technical_sheet_pdf.bind(vehiclesController));

// Actualizar vehículo
/**
 * @openapi
 * /vehicles/{id}:
 *   put:
 *     tags: [Vehicles]
 *     summary: Actualizar vehículo (admin/coordinador/comercia)
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
 *             additionalProperties: true
 *     responses:
 *       200:
 *         description: Vehículo actualizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 */
router.put("/:id", VehicleWriteAuth, vehiclesController.update_vehicle.bind(vehiclesController));

// Actualizar imagen del vehículo
/**
 * @openapi
 * /vehicles/{id}/picture:
 *   put:
 *     tags: [Vehicles]
 *     summary: Actualizar imagen del vehículo (admin/coordinador/comercia)
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               picture: { type: string, format: binary }
 *             required: [picture]
 *     responses:
 *       200:
 *         description: Imagen actualizada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 */
router.put(
    "/:id/picture",
    VehicleWriteAuth,
    upload.single("picture"),
    vehiclesController.update_vehicle_picture.bind(vehiclesController)
);

// Actualizar propietario del vehículo
/**
 * @openapi
 * /vehicles/{id}/owner:
 *   put:
 *     tags: [Vehicles]
 *     summary: Actualizar propietario del vehículo (admin/coordinador/comercia)
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
 *               owner_id: { type: object, description: "Owner: {type:'Company', company_id} o {type:'User', user_id}" }
 *             required: [owner_id]
 *     responses:
 *       200:
 *         description: Propietario actualizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 */
router.put("/:id/owner", VehicleWriteAuth, vehiclesController.update_vehicle_owner.bind(vehiclesController));

// Actualizar conductor del vehículo
/**
 * @openapi
 * /vehicles/{id}/driver:
 *   put:
 *     tags: [Vehicles]
 *     summary: Actualizar conductor asignado al vehículo (admin/coordinador/comercia)
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
 *               driver_id: { type: string }
 *             required: [driver_id]
 *     responses:
 *       200:
 *         description: Conductor actualizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 */
router.put("/:id/driver", VehicleWriteAuth, vehiclesController.update_vehicle_driver.bind(vehiclesController));

// Buscar vehículos por placa (autocomplete)
/**
 * @openapi
 * /vehicles/search/placa:
 *   get:
 *     tags: [Vehicles]
 *     summary: Buscar vehículos por placa (autocomplete)
 *     description: |
 *       Busca vehículos por placa mientras el usuario escribe. Devuelve resultados con todos los IDs populizados
 *       (conductor, posibles conductores, propietario). Útil para autocompletar en inputs.
 *       Usa `company_id` del token si existe, o se puede enviar por query.
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: query
 *         name: placa
 *         required: true
 *         schema: { type: string }
 *         description: Placa o parte de la placa a buscar
 *       - in: query
 *         name: company_id
 *         schema: { type: string }
 *         description: Opcional. Filtrar por compañía
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *         description: Límite de resultados
 *     responses:
 *       200:
 *         description: Lista de vehículos encontrados
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id: { type: string }
 *                       placa: { type: string }
 *                       name: { type: string }
 *                       seats: { type: number }
 *                       type: { type: string }
 *                       flota: { type: string }
 *                       conductor:
 *                         type: object
 *                         properties:
 *                           _id: { type: string }
 *                           full_name: { type: string }
 *                           phone: { type: string }
 *                           email: { type: string }
 *                       propietario:
 *                         type: object
 *                         properties:
 *                           type: { type: string }
 *                           company: { type: object }
 *                           user: { type: object }
 *               required: [message, data]
 */
router.get("/search/placa", SessionAuth, vehiclesController.search_vehicles_by_placa.bind(vehiclesController));

// Exportar vehículos a Excel
/**
 * @openapi
 * /vehicles/export/excel:
 *   get:
 *     tags: [Vehicles]
 *     summary: Exportar vehículos a Excel
 *     description: |
 *       Exporta vehículos a Excel. Puede exportar todos los vehículos, filtrar por tipo/flota,
 *       o exportar vehículos específicos proporcionando sus IDs.
 *       Incluye información completa del vehículo, conductor, propietario y ficha técnica.
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: query
 *         name: vehicle_ids
 *         schema: { type: string }
 *         description: Opcional: IDs de vehículos separados por coma para exportar solo esos vehículos
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [bus, buseta, buseton, camioneta, campero, micro, van] }
 *         description: Opcional: Filtrar por tipo de vehículo
 *       - in: query
 *         name: flota
 *         schema: { type: string, enum: [externo, propio, afiliado] }
 *         description: Opcional: Filtrar por flota
 *       - in: query
 *         name: placa
 *         schema: { type: string }
 *         description: Opcional: Filtrar por placa (búsqueda parcial)
 *       - in: query
 *         name: name
 *         schema: { type: string }
 *         description: Opcional: Filtrar por nombre (búsqueda parcial)
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
router.get("/export/excel", SessionAuth, vehiclesController.export_vehicles_to_excel.bind(vehiclesController));

export default router;

