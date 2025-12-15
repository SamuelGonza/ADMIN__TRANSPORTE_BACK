import { Router } from "express";
import { LocationsController } from "@/controllers/locations.controller";
import { CoordinadorAuth } from "@/auth/coordinador.auth";

const router: Router = Router();
const locationsController = new LocationsController();

// Listado / búsqueda para autocompletado
/**
 * @openapi
 * /locations:
 *   get:
 *     tags: [Locations]
 *     summary: Listar/buscar lugares (autocompletado)
 *     description: |
 *       Devuelve lugares ordenados por uso. Requiere `company_id` (del token o query).
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: query
 *         name: company_id
 *         schema: { type: string, description: "Opcional si el token trae company_id" }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Lista de lugares
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Location'
 *               required: [message, data]
 */
router.get("/", CoordinadorAuth, locationsController.list_locations.bind(locationsController));

export default router;



