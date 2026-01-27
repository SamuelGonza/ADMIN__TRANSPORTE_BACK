import { Router } from "express";
import { ClientUserController } from "@/controllers/client_user.controller";
import { GestionAuth } from "@/auth/gestion.auth";
import { ClienteAuth } from "@/auth/cliente.auth";

const router: Router = Router();
const clientUserController = new ClientUserController();

// #========== RUTAS PROTEGIDAS ==========#

// Crear nuevo subusuario de cliente
/**
 * @openapi
 * /client_users:
 *   post:
 *     tags: [ClientUsers]
 *     summary: Crear subusuario de cliente
 *     description: |
 *       Crea un subusuario para un cliente. Los clientes solo pueden crear subusuarios para sí mismos.
 *       Los admins/coordinadores pueden crear subusuarios para cualquier cliente de su compañía.
 *     security:
 *       - sessionCookie: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name: { type: string, description: "Nombre completo del subusuario" }
 *               email: { type: string, format: email, description: "Email único del subusuario" }
 *               cliente_id: { type: string, description: "ID del cliente (opcional si eres cliente autenticado)" }
 *               company_id: { type: string, description: "ID de la compañía (opcional, se toma del usuario autenticado)" }
 *             required: [full_name, email]
 *     responses:
 *       201:
 *         description: Subusuario creado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data: { type: object }
 *               required: [message, data]
 */
router.post("/", ClienteAuth, clientUserController.create_client_user.bind(clientUserController));

// Obtener todos los subusuarios de cliente
/**
 * @openapi
 * /client_users:
 *   get:
 *     tags: [ClientUsers]
 *     summary: Listar subusuarios de cliente
 *     description: |
 *       Lista los subusuarios de cliente. Los clientes solo ven sus propios subusuarios.
 *       Los admins/coordinadores pueden filtrar por cliente y compañía.
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
 *         name: company_id
 *         schema: { type: string }
 *       - in: query
 *         name: cliente_id
 *         schema: { type: string }
 *       - in: query
 *         name: full_name
 *         schema: { type: string }
 *       - in: query
 *         name: email
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Subusuarios paginados
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     client_users: { type: array, items: { type: object } }
 *                     pagination: { type: object }
 *               required: [message, data]
 */
router.get("/", ClienteAuth, clientUserController.get_all_client_users.bind(clientUserController));

// Obtener subusuario por ID
/**
 * @openapi
 * /client_users/{id}:
 *   get:
 *     tags: [ClientUsers]
 *     summary: Obtener subusuario por ID
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Subusuario
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data: { type: object }
 *               required: [message, data]
 */
router.get("/:id", ClienteAuth, clientUserController.get_client_user_by_id.bind(clientUserController));

// Actualizar información de subusuario
/**
 * @openapi
 * /client_users/{id}:
 *   put:
 *     tags: [ClientUsers]
 *     summary: Actualizar subusuario
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
 *               full_name: { type: string }
 *     responses:
 *       200:
 *         description: Subusuario actualizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 */
router.put("/:id", ClienteAuth, clientUserController.update_client_user_info.bind(clientUserController));

// Eliminar subusuario
/**
 * @openapi
 * /client_users/{id}:
 *   delete:
 *     tags: [ClientUsers]
 *     summary: Eliminar subusuario
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Subusuario eliminado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 */
router.delete("/:id", ClienteAuth, clientUserController.delete_client_user.bind(clientUserController));

export default router;
