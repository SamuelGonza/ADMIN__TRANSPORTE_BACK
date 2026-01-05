import { Router } from "express";
import { ContractsController } from "@/controllers/contracts.controller";
import { GestionAuth } from "@/auth/gestion.auth";

const router: Router = Router();
const contractsController = new ContractsController();

// #========== RUTAS PROTEGIDAS (Coordinador+ / Comercia / Operador / Contabilidad incluido por middleware) ==========#

// Crear contrato
/**
 * @openapi
 * /contracts:
 *   post:
 *     tags: [Contracts]
 *     summary: Crear contrato (gestión)
 *     security:
 *       - sessionCookie: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               company_id: { type: string, description: "Opcional si token trae company_id" }
 *               client_id: { type: string }
 *               tipo_contrato: { type: string, enum: [fijo], default: fijo }
 *               periodo_presupuesto: { type: string }
 *               valor_presupuesto: { type: number, nullable: true }
 *               cobro:
 *                 type: object
 *                 properties:
 *                   modo_default: { type: string, enum: [por_hora, por_kilometro, por_distancia, tarifa_amva, por_viaje, por_trayecto] }
 *                   por_hora: { type: number }
 *                   por_kilometro: { type: number }
 *                   por_distancia: { type: number }
 *                   tarifa_amva: { type: number }
 *                   por_viaje: { type: number }
 *                   por_trayecto: { type: number }
 *               notes: { type: string }
 *             required: [client_id]
 *     responses:
 *       201:
 *         description: Contrato creado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data: { type: object }
 *               required: [message, data]
 */
router.post("/", GestionAuth, contractsController.create_contract.bind(contractsController));

// Listar todos los contratos de la compañía
/**
 * @openapi
 * /contracts:
 *   get:
 *     tags: [Contracts]
 *     summary: Listar todos los contratos de la compañía
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: query
 *         name: only_active
 *         schema: { type: boolean, default: false }
 *         description: Si es true, solo retorna contratos activos
 *     responses:
 *       200:
 *         description: Lista de contratos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data: { type: array, items: { type: object } }
 *               required: [message, data]
 */
router.get("/", GestionAuth, contractsController.get_all_contracts.bind(contractsController));

// Obtener contratos de un cliente
/**
 * @openapi
 * /contracts/client/{client_id}:
 *   get:
 *     tags: [Contracts]
 *     summary: Listar contratos de un cliente
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: client_id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: only_active
 *         schema: { type: boolean, default: false }
 *     responses:
 *       200:
 *         description: Lista de contratos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data: { type: array, items: { type: object } }
 *               required: [message, data]
 */
router.get("/client/:client_id", GestionAuth, contractsController.get_contracts_by_client.bind(contractsController));

// Obtener contrato por id
/**
 * @openapi
 * /contracts/{id}:
 *   get:
 *     tags: [Contracts]
 *     summary: Obtener contrato por ID
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Contrato
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data: { type: object }
 *               required: [message, data]
 */
router.get("/:id", GestionAuth, contractsController.get_contract_by_id.bind(contractsController));

// Actualizar contrato
/**
 * @openapi
 * /contracts/{id}:
 *   put:
 *     tags: [Contracts]
 *     summary: Actualizar contrato
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
 *         description: Contrato actualizado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data: { type: object }
 *               required: [message, data]
 */
router.put("/:id", GestionAuth, contractsController.update_contract.bind(contractsController));

// Aplicar cargo manual a contrato (opcional)
/**
 * @openapi
 * /contracts/{id}/charge:
 *   post:
 *     tags: [Contracts]
 *     summary: Aplicar cargo al contrato
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
 *               amount: { type: number }
 *               solicitud_id: { type: string }
 *               notes: { type: string }
 *             required: [amount]
 *     responses:
 *       200:
 *         description: Cargo aplicado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data: { type: object }
 *               required: [message, data]
 */
router.post("/:id/charge", GestionAuth, contractsController.charge_contract.bind(contractsController));

export default router;



