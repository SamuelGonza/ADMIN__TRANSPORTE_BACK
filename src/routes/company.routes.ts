import { Router } from "express";
import { CompanyController } from "@/controllers/company.controller";
import { SuperAdminAut } from "@/auth/superadmon.auth";
import { AdminAut } from "@/auth/admin.auth";
import { ContabilidadAuth } from "@/auth/contabilidad.auth";

const router: Router = Router();
const companyController = new CompanyController();

// #========== RUTAS PROTEGIDAS ==========#

// Crear nueva compañía (Solo SuperAdmin)
/**
 * @openapi
 * /companies:
 *   post:
 *     tags: [Companies]
 *     summary: Crear compañía (superadmon)
 *     security:
 *       - sessionCookie: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               c_payload: { type: object, description: "Datos de compañía (company_name, document, ...)" }
 *               admin_payload: { type: object, description: "Datos del admin inicial de la compañía" }
 *             required: [c_payload, admin_payload]
 *     responses:
 *       201:
 *         description: Compañía creada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 */
router.post("/", SuperAdminAut, companyController.create_company.bind(companyController));

// Obtener todas las compañías (Solo SuperAdmin)
/**
 * @openapi
 * /companies:
 *   get:
 *     tags: [Companies]
 *     summary: Listar compañías (superadmon)
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
 *         name: name
 *         schema: { type: string }
 *       - in: query
 *         name: document
 *         schema: { type: integer }
 *       - in: query
 *         name: created
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Compañías paginadas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     companies: { type: array, items: { type: object } }
 *                     pagination: { $ref: '#/components/schemas/CompaniesPagination' }
 *               required: [message, data]
 */
router.get("/", SuperAdminAut, companyController.get_all_companies.bind(companyController));

// Obtener compañía por ID
/**
 * @openapi
 * /companies/{id}:
 *   get:
 *     tags: [Companies]
 *     summary: Obtener compañía por ID (admin)
 *     description: Si el token trae company_id, el backend puede ignorar el id y devolver la compañía del usuario.
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Compañía
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data: { type: object }
 *               required: [message, data]
 */
router.get("/:id", AdminAut, companyController.get_company_by_id.bind(companyController));

// Obtener información de facturación electrónica de la compañía
/**
 * @openapi
 * /companies/{id}/fe-info:
 *   get:
 *     tags: [Companies]
 *     summary: Obtener información de facturación electrónica (contabilidad)
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Info FE (simba_token, fe_id)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     simba_token: { type: string }
 *                     fe_id: { type: string }
 *               required: [message, data]
 */
router.get("/:id/fe-info", ContabilidadAuth, companyController.get_company_fe_info.bind(companyController));

export default router;

