import { Router } from "express";
import { VehiclesController } from "@/controllers/vehicles.controller";
import { AdminAut } from "@/auth/admin.auth";
import { CoordinadorAuth } from "@/auth/coordinador.auth";
import { OperadorAuth } from "@/auth/operador.auth";
import { upload } from "@/middlewares/multer.middleware";

const router: Router = Router();
const vehiclesController = new VehiclesController();

// #========== RUTAS PROTEGIDAS ==========#

// Crear nuevo vehículo
router.post(
    "/",
    AdminAut,
    upload.single("picture"),
    vehiclesController.create_vehicle.bind(vehiclesController)
);

// Crear reporte preoperacional (conductor)
router.post(
    "/preoperational",
    OperadorAuth,
    upload.any(), // Permite múltiples archivos con nombres dinámicos
    vehiclesController.create_preoperational_report.bind(vehiclesController)
);

// Registrar gastos operacionales
router.post(
    "/operational-bills",
    OperadorAuth,
    upload.any(), // Permite múltiples archivos con nombres dinámicos
    vehiclesController.create_operational_bills.bind(vehiclesController)
);

// Obtener todos los vehículos
router.get("/", CoordinadorAuth, vehiclesController.get_all_vehicles.bind(vehiclesController));

// Obtener vehículos por compañía
router.get("/company", CoordinadorAuth, vehiclesController.get_all_vehicles_by_company.bind(vehiclesController));
router.get("/company/:company_id", CoordinadorAuth, vehiclesController.get_all_vehicles_by_company.bind(vehiclesController));

// Obtener todos los vehículos con sus últimos reportes (operacional y preoperacional)
router.get("/last-reports", CoordinadorAuth, vehiclesController.get_all_vehicles_last_reports.bind(vehiclesController));
router.get("/last-reports/:company_id", CoordinadorAuth, vehiclesController.get_all_vehicles_last_reports.bind(vehiclesController));

// Obtener vehículos por usuario
router.get("/user/:user_id", OperadorAuth, vehiclesController.get_vehicles_by_user.bind(vehiclesController));

// Obtener documentos de un vehículo
router.get("/:vehicle_id/documents", CoordinadorAuth, vehiclesController.get_vehicle_documents.bind(vehiclesController));

// Obtener operacionales de un vehículo (historial)
router.get("/:vehicle_id/operationals", CoordinadorAuth, vehiclesController.get_vehicle_operationals.bind(vehiclesController));

// Obtener preoperacionales de un vehículo (historial)
router.get("/:vehicle_id/preoperationals", CoordinadorAuth, vehiclesController.get_vehicle_preoperationals.bind(vehiclesController));

// Obtener último operacional de un vehículo
router.get("/:vehicle_id/last-operational", OperadorAuth, vehiclesController.get_last_operational_by_vehicle.bind(vehiclesController));

// Obtener último preoperacional de un vehículo
router.get("/:vehicle_id/last-preoperational", OperadorAuth, vehiclesController.get_last_preoperational_by_vehicle.bind(vehiclesController));

// Obtener vehículo por ID
router.get("/:id", CoordinadorAuth, vehiclesController.get_vehicle_by_id.bind(vehiclesController));

// Actualizar vehículo
router.put("/:id", AdminAut, vehiclesController.update_vehicle.bind(vehiclesController));

// Actualizar imagen del vehículo
router.put(
    "/:id/picture",
    AdminAut,
    upload.single("picture"),
    vehiclesController.update_vehicle_picture.bind(vehiclesController)
);

// Actualizar propietario del vehículo
router.put("/:id/owner", AdminAut, vehiclesController.update_vehicle_owner.bind(vehiclesController));

// Actualizar conductor del vehículo
router.put("/:id/driver", AdminAut, vehiclesController.update_vehicle_driver.bind(vehiclesController));

export default router;

