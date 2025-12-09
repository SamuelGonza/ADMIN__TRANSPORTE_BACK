import { Router } from "express";
import { SolicitudesController } from "@/controllers/solicitudes.controller";
import { ClienteAuth } from "@/auth/cliente.auth";
import { CoordinadorAuth } from "@/auth/coordinador.auth";
import { OperadorAuth } from "@/auth/operador.auth";
import { ContabilidadAuth } from "@/auth/contabilidad.auth";
import { ConductorAuth } from "@/auth/conductor.auth";

const router: Router = Router();
const solicitudesController = new SolicitudesController();

// #========== RUTAS PROTEGIDAS ==========#

// Crear solicitud como cliente
router.post("/client", ClienteAuth, solicitudesController.create_solicitud_client.bind(solicitudesController));

// Crear solicitud como coordinador (ya aprobada)
router.post("/coordinator", CoordinadorAuth, solicitudesController.create_solicitud_coordinator.bind(solicitudesController));

// Obtener todas las solicitudes (coordinador+)
router.get("/", CoordinadorAuth, solicitudesController.get_all_solicitudes.bind(solicitudesController));

// #========== RUTAS DEL CONDUCTOR ==========#

// Obtener mis solicitudes asignadas (conductor)
router.get("/my-services", ConductorAuth, solicitudesController.get_my_solicitudes.bind(solicitudesController));

// Obtener detalle de mi solicitud asignada (conductor)
router.get("/my-services/:id", ConductorAuth, solicitudesController.get_my_solicitud_by_id.bind(solicitudesController));

// Iniciar servicio (conductor)
router.put("/:id/start", ConductorAuth, solicitudesController.start_service.bind(solicitudesController));

// Finalizar servicio (conductor)
router.put("/:id/finish", ConductorAuth, solicitudesController.finish_service.bind(solicitudesController));

// #========== RUTAS DE COORDINADOR ==========#

// Obtener solicitud por ID
router.get("/:id", CoordinadorAuth, solicitudesController.get_solicitud_by_id.bind(solicitudesController));

// Aceptar solicitud pendiente
router.put("/:id/accept", CoordinadorAuth, solicitudesController.accept_solicitud.bind(solicitudesController));

// Rechazar solicitud pendiente
router.put("/:id/reject", CoordinadorAuth, solicitudesController.reject_solicitud.bind(solicitudesController));

// Actualizar datos financieros
router.put("/:id/financial", ContabilidadAuth, solicitudesController.update_financial_data.bind(solicitudesController));

export default router;

