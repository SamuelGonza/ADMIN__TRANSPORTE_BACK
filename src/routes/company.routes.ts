import { Router } from "express";
import { CompanyController } from "@/controllers/company.controller";
import { SuperAdminAut } from "@/auth/superadmon.auth";
import { AdminAut } from "@/auth/admin.auth";
import { ContabilidadAuth } from "@/auth/contabilidad.auth";

const router: Router = Router();
const companyController = new CompanyController();

// #========== RUTAS PROTEGIDAS ==========#

// Crear nueva compañía (Solo SuperAdmin)
router.post("/", SuperAdminAut, companyController.create_company.bind(companyController));

// Obtener todas las compañías (Solo SuperAdmin)
router.get("/", SuperAdminAut, companyController.get_all_companies.bind(companyController));

// Obtener compañía por ID
router.get("/:id", AdminAut, companyController.get_company_by_id.bind(companyController));

// Obtener información de facturación electrónica de la compañía
router.get("/:id/fe-info", ContabilidadAuth, companyController.get_company_fe_info.bind(companyController));

export default router;

