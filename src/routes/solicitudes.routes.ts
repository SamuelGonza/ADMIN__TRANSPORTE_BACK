import { Router } from "express";
import { SolicitudesController } from "@/controllers/solicitudes.controller";
import { ClienteAuth } from "@/auth/cliente.auth";
import { CoordinadorAuth } from "@/auth/coordinador.auth";
import { OperadorAuth } from "@/auth/operador.auth";
import { ContabilidadAuth } from "@/auth/contabilidad.auth";

const router: Router = Router();
const solicitudesController = new SolicitudesController();

// #========== RUTAS PROTEGIDAS ==========#

// Crear solicitud como cliente
router.post("/client", ClienteAuth, solicitudesController.create_solicitud_client.bind(solicitudesController));

// Crear solicitud como coordinador (ya aprobada)
router.post("/coordinator", CoordinadorAuth, solicitudesController.create_solicitud_coordinator.bind(solicitudesController));

// Obtener todas las solicitudes
router.get("/", CoordinadorAuth, solicitudesController.get_all_solicitudes.bind(solicitudesController));

// Obtener solicitud por ID
router.get("/:id", CoordinadorAuth, solicitudesController.get_solicitud_by_id.bind(solicitudesController));

// Aceptar solicitud pendiente
router.put("/:id/accept", CoordinadorAuth, solicitudesController.accept_solicitud.bind(solicitudesController));

// Rechazar solicitud pendiente
router.put("/:id/reject", CoordinadorAuth, solicitudesController.reject_solicitud.bind(solicitudesController));

// Iniciar servicio (conductor)
router.put("/:id/start", OperadorAuth, solicitudesController.start_service.bind(solicitudesController));

// Finalizar servicio (conductor)
router.put("/:id/finish", OperadorAuth, solicitudesController.finish_service.bind(solicitudesController));

// Actualizar datos financieros
router.put("/:id/financial", ContabilidadAuth, solicitudesController.update_financial_data.bind(solicitudesController));

export default router;

