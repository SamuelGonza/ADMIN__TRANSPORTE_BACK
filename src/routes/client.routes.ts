import { Router } from "express";
import { ClientController } from "@/controllers/client.controller";
import { GestionAuth } from "@/auth/gestion.auth";
import { SessionAuth } from "@/auth/session.auth";

const router: Router = Router();
const clientController = new ClientController();

// #========== RUTAS PÚBLICAS ==========#

// Login de cliente
/**
 * @openapi
 * /clients/login:
 *   post:
 *     tags: [Clients]
 *     summary: Login (cliente)
 *     description: |
 *       Inicia sesión como cliente. Devuelve `token` y datos del cliente, y además setea la cookie `_session_token_`.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ClientLoginRequest'
 *     responses:
 *       200:
 *         description: Sesión iniciada correctamente
 *         headers:
 *           Set-Cookie:
 *             description: Cookie httpOnly de sesión `_session_token_`
 *             schema:
 *               type: string
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeClientLogin'
 *       401:
 *         description: Credenciales inválidas
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/login", clientController.login.bind(clientController));

// #========== RUTAS DE SESIÓN (Cliente autenticado) ==========#
// Obtener información del cliente autenticado (verifica sesión)
/**
 * @openapi
 * /clients/me:
 *   get:
 *     tags: [Clients]
 *     summary: Sesión actual (cliente)
 *     security:
 *       - sessionCookie: []
 *     responses:
 *       200:
 *         description: Sesión válida
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data: { type: object }
 *               required: [message, data]
 *       401:
 *         description: Sin sesión
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/me", SessionAuth, clientController.get_me.bind(clientController));

// Renovar/refrescar la sesión
/**
 * @openapi
 * /clients/refresh:
 *   post:
 *     tags: [Clients]
 *     summary: Renovar sesión (cliente)
 *     security:
 *       - sessionCookie: []
 *     responses:
 *       200:
 *         description: Sesión renovada
 *         headers:
 *           Set-Cookie:
 *             description: Cookie de sesión renovada `_session_token_`
 *             schema:
 *               type: string
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     token: { type: string }
 *                     client: { type: object }
 *               required: [message, data]
 */
router.post("/refresh", SessionAuth, clientController.refresh_session.bind(clientController));

// Cerrar sesión
/**
 * @openapi
 * /clients/logout:
 *   post:
 *     tags: [Clients]
 *     summary: Cerrar sesión (cliente)
 *     security:
 *       - sessionCookie: []
 *     responses:
 *       200:
 *         description: Sesión cerrada
 *         headers:
 *           Set-Cookie:
 *             description: Cookie `_session_token_` limpiada
 *             schema:
 *               type: string
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 */
router.post("/logout", SessionAuth, clientController.logout.bind(clientController));

// #========== RUTAS PROTEGIDAS (Coordinador+) ==========#

// Crear nuevo cliente (Coordinador o superior)
/**
 * @openapi
 * /clients:
 *   post:
 *     tags: [Clients]
 *     summary: Crear cliente (gestión)
 *     description: |
 *       Crea un cliente para la empresa del usuario autenticado (o `company_id` si se envía).
 *       Opcionalmente se puede crear un contrato junto con el cliente enviando el objeto `contract`.
 *       Si no se envía `contract`, el cliente se crea sin contrato (servicios ocasionales).
 *     security:
 *       - sessionCookie: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               contact_name: { type: string }
 *               contact_phone: { type: string }
 *               email: { type: string, format: email }
 *               company_id: { type: string }
 *               contract:
 *                 type: object
 *                 description: Opcional. Si se proporciona, se crea un contrato fijo junto con el cliente.
 *                 properties:
 *                   periodo_presupuesto: { type: string, enum: [anio, mes, semana, dia] }
 *                   valor_presupuesto: { type: number }
 *                   cobro:
 *                     type: object
 *                     properties:
 *                       modo_default: { type: string, enum: [por_hora, por_kilometro, por_distancia, tarifa_amva, por_viaje, por_trayecto] }
 *                       por_hora: { type: number }
 *                       por_kilometro: { type: number }
 *                       por_distancia: { type: number }
 *                       tarifa_amva: { type: number }
 *                       por_viaje: { type: number }
 *                       por_trayecto: { type: number }
 *                   notes: { type: string }
 *                 required: [periodo_presupuesto, valor_presupuesto]
 *             required: [name, email]
 *     responses:
 *       201:
 *         description: Cliente creado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 */
router.post("/", GestionAuth, clientController.create_client.bind(clientController));

// Obtener todos los clientes
/**
 * @openapi
 * /clients:
 *   get:
 *     tags: [Clients]
 *     summary: Listar clientes (gestión)
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
 *         name: name
 *         schema: { type: string }
 *       - in: query
 *         name: email
 *         schema: { type: string }
 *       - in: query
 *         name: contact_name
 *         schema: { type: string }
 *       - in: query
 *         name: contact_phone
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Clientes paginados
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     clients: { type: array, items: { type: object } }
 *                     pagination: { type: object }
 *               required: [message, data]
 */
router.get("/", GestionAuth, clientController.get_all_clients.bind(clientController));

// Obtener cliente por ID
/**
 * @openapi
 * /clients/{id}:
 *   get:
 *     tags: [Clients]
 *     summary: Obtener cliente por ID (gestión)
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Cliente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data: { type: object }
 *               required: [message, data]
 */
router.get("/:id", GestionAuth, clientController.get_client_by_id.bind(clientController));

// Actualizar información de cliente
/**
 * @openapi
 * /clients/{id}:
 *   put:
 *     tags: [Clients]
 *     summary: Actualizar cliente (gestión)
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
 *               name: { type: string }
 *               contact_name: { type: string }
 *               contact_phone: { type: string }
 *               contacts: 
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name: { type: string }
 *                     phone: { type: string }
 *               phone: { type: string }
 *               email: { type: string, format: email }
 *               documento_tipo: { type: string, enum: [NIT, CC, CE, PASAPORTE, OTRO] }
 *               documento_numero: { type: string }
 *             required: [name, email]
 *     responses:
 *       200:
 *         description: Cliente actualizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 */
router.put("/:id", GestionAuth, clientController.update_client_info.bind(clientController));

// Resetear contraseña de cliente
/**
 * @openapi
 * /clients/{id}/reset-password:
 *   post:
 *     tags: [Clients]
 *     summary: Resetear contraseña del cliente (gestión)
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Contraseña reseteada (se envía por email)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 */
router.post("/:id/reset-password", GestionAuth, clientController.reset_client_password.bind(clientController));

export default router;

