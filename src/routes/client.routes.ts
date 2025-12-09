import { Router } from "express";
import { ClientController } from "@/controllers/client.controller";
import { CoordinadorAuth } from "@/auth/coordinador.auth";
import { SessionAuth } from "@/auth/session.auth";

const router: Router = Router();
const clientController = new ClientController();

// #========== RUTAS PÚBLICAS ==========#

// Login de cliente
router.post("/login", clientController.login.bind(clientController));

// #========== RUTAS DE SESIÓN (Cliente autenticado) ==========#
// Obtener información del cliente autenticado (verifica sesión)
router.get("/me", SessionAuth, clientController.get_me.bind(clientController));

// Renovar/refrescar la sesión
router.post("/refresh", SessionAuth, clientController.refresh_session.bind(clientController));

// Cerrar sesión
router.post("/logout", SessionAuth, clientController.logout.bind(clientController));

// #========== RUTAS PROTEGIDAS (Coordinador+) ==========#

// Crear nuevo cliente (Coordinador o superior)
router.post("/", CoordinadorAuth, clientController.create_client.bind(clientController));

// Obtener todos los clientes
router.get("/", CoordinadorAuth, clientController.get_all_clients.bind(clientController));

// Obtener cliente por ID
router.get("/:id", CoordinadorAuth, clientController.get_client_by_id.bind(clientController));

// Actualizar información de cliente
router.put("/:id", CoordinadorAuth, clientController.update_client_info.bind(clientController));

// Resetear contraseña de cliente
router.post("/:id/reset-password", CoordinadorAuth, clientController.reset_client_password.bind(clientController));

export default router;

