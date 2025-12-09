import { Router } from "express";
import { UsersController } from "@/controllers/users.controller";
import { AdminAut } from "@/auth/admin.auth";
import { CoordinadorAuth } from "@/auth/coordinador.auth";
import { OperadorAuth } from "@/auth/operador.auth";
import { SessionAuth } from "@/auth/session.auth";
import { upload } from "@/middlewares/multer.middleware";
import { SuperAdminAut } from "@/auth/superadmon.auth";
import { ContabilidadAuth } from "@/auth/contabilidad.auth";

const router: Router = Router();
const usersController = new UsersController();

// #========== RUTAS PÚBLICAS (Sin autenticación) ==========#
router.post("/login", usersController.login.bind(usersController));
router.post("/verify-otp", usersController.verify_new_account_otp.bind(usersController));
router.post("/reset-password", usersController.reset_password.bind(usersController));
router.post("/verify-otp-reset", usersController.verify_otp_password_reset.bind(usersController));
router.post("/update-password", usersController.update_new_password.bind(usersController));

// #========== RUTAS DE SESIÓN ==========#
// Obtener información del usuario autenticado (verifica sesión)
router.get("/me", SessionAuth, usersController.get_me.bind(usersController));

// Renovar/refrescar la sesión
router.post("/refresh", SessionAuth, usersController.refresh_session.bind(usersController));

// Cerrar sesión
router.post("/logout", SessionAuth, usersController.logout.bind(usersController));

// #========== RUTAS PROTEGIDAS ==========#

// Registro de usuarios (Admin puede crear usuarios en su empresa)
router.post("/register", CoordinadorAuth, usersController.register_user.bind(usersController));

// Subida de documentos de conductor
router.post(
    "/driver-documents",
    OperadorAuth,
    upload.fields([
        { name: "document_front", maxCount: 1 },
        { name: "document_back", maxCount: 1 },
        { name: "license_front", maxCount: 1 },
        { name: "license_back", maxCount: 1 }
    ]),
    usersController.upload_driver_documents.bind(usersController)
);

// Obtener todos los usuarios (SuperAdmin puede ver todos)
router.get("/", SuperAdminAut, usersController.get_all_users.bind(usersController));

// Obtener usuarios de una compañía específica
router.get("/company/:company_id", ContabilidadAuth, usersController.get_all_users_company.bind(usersController));

// Obtener usuario por ID
router.get("/:id", ContabilidadAuth, usersController.get_user_by_id.bind(usersController));

// Actualizar información de usuario
router.put("/:id", CoordinadorAuth, usersController.update_user_info.bind(usersController));

// Actualizar avatar de usuario
router.put(
    "/:id/avatar",
    CoordinadorAuth,
    upload.single("avatar"),
    usersController.update_user_avatar.bind(usersController)
);

// Actualizar documentos de conductor
router.put(
    "/driver/:driver_id/documents",
    OperadorAuth,
    upload.fields([
        { name: "document_front", maxCount: 1 },
        { name: "document_back", maxCount: 1 },
        { name: "license_front", maxCount: 1 },
        { name: "license_back", maxCount: 1 }
    ]),
    usersController.update_driver_documents.bind(usersController)
);

// Cambiar estado activo de usuario
router.patch("/:id/status", AdminAut, usersController.change_active_status.bind(usersController));

// Eliminar usuario (soft delete)
router.delete("/:id", AdminAut, usersController.delete_user.bind(usersController));

export default router;

