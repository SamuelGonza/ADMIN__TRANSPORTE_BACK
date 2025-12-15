import { Router } from "express";
import { UsersController } from "@/controllers/users.controller";
import { AdminAut } from "@/auth/admin.auth";
import { CoordinadorAuth } from "@/auth/coordinador.auth";
import { OperadorAuth } from "@/auth/operador.auth";
import { SessionAuth } from "@/auth/session.auth";
import { upload } from "@/middlewares/multer.middleware";
import { SuperAdminAut } from "@/auth/superadmon.auth";
import { ContabilidadAuth } from "@/auth/contabilidad.auth";
import { UsersReadAuth } from "@/auth/users-read.auth";

const router: Router = Router();
const usersController = new UsersController();

/**
 * @openapi
 * /users/login:
 *   post:
 *     tags: [Users]
 *     summary: Login (usuarios internos)
 *     description: |
 *       Inicia sesión como usuario interno (staff). Devuelve `token` y datos del usuario, y además setea la cookie `_session_token_`.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserLoginRequest'
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
 *               $ref: '#/components/schemas/EnvelopeUserLogin'
 *       401:
 *         description: Credenciales inválidas / cuenta inactiva
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
// #========== RUTAS PÚBLICAS (Sin autenticación) ==========#
router.post("/login", usersController.login.bind(usersController));

/**
 * @openapi
 * /users/verify-otp:
 *   post:
 *     tags: [Users]
 *     summary: Verificar OTP de activación de cuenta (usuario)
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email: { type: string, format: email }
 *               otp_recovery: { type: number, example: 123456 }
 *             required: [email, otp_recovery]
 *     responses:
 *       200:
 *         description: Cuenta verificada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 *       404:
 *         description: Usuario no encontrado / OTP inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/verify-otp", usersController.verify_new_account_otp.bind(usersController));

/**
 * @openapi
 * /users/reset-password:
 *   post:
 *     tags: [Users]
 *     summary: Iniciar proceso de reseteo de contraseña (envía OTP)
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email: { type: string, format: email }
 *             required: [email]
 *     responses:
 *       200:
 *         description: Proceso iniciado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 *       404:
 *         description: Cuenta no encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/reset-password", usersController.reset_password.bind(usersController));

/**
 * @openapi
 * /users/verify-otp-reset:
 *   post:
 *     tags: [Users]
 *     summary: Verificar OTP para reseteo de contraseña
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email: { type: string, format: email }
 *               otp_recovery: { type: number, example: 123456 }
 *             required: [email, otp_recovery]
 *     responses:
 *       200:
 *         description: OTP verificado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 *       401:
 *         description: OTP inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/verify-otp-reset", usersController.verify_otp_password_reset.bind(usersController));

/**
 * @openapi
 * /users/update-password:
 *   post:
 *     tags: [Users]
 *     summary: Actualizar contraseña después de verificar OTP
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email: { type: string, format: email }
 *               new_password: { type: string, example: "NuevaPass123" }
 *             required: [email, new_password]
 *     responses:
 *       200:
 *         description: Contraseña actualizada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 */
router.post("/update-password", usersController.update_new_password.bind(usersController));

// #========== RUTAS DE SESIÓN ==========#
// Obtener información del usuario autenticado (verifica sesión)
/**
 * @openapi
 * /users/me:
 *   get:
 *     tags: [Users]
 *     summary: Sesión actual (usuario)
 *     description: Requiere sesión activa (cookie `_session_token_`).
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
router.get("/me", SessionAuth, usersController.get_me.bind(usersController));

// Renovar/refrescar la sesión
/**
 * @openapi
 * /users/refresh:
 *   post:
 *     tags: [Users]
 *     summary: Renovar sesión (usuario)
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
 *                     user: { type: object }
 *               required: [message, data]
 */
router.post("/refresh", SessionAuth, usersController.refresh_session.bind(usersController));

// Cerrar sesión
/**
 * @openapi
 * /users/logout:
 *   post:
 *     tags: [Users]
 *     summary: Cerrar sesión (usuario)
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
router.post("/logout", SessionAuth, usersController.logout.bind(usersController));

// #========== RUTAS PROTEGIDAS ==========#

// Registro de usuarios (Admin puede crear usuarios en su empresa)
/**
 * @openapi
 * /users/register:
 *   post:
 *     tags: [Users]
 *     summary: Registrar usuario (coordinador+)
 *     description: |
 *       Crea un usuario dentro de la empresa del usuario autenticado (o `company_id` si aplica).
 *       Requiere rol `coordinador` o superior según middleware.
 *     security:
 *       - sessionCookie: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name: { type: string }
 *               document: { type: object }
 *               role: { type: string, example: "operador" }
 *               contact: { type: object }
 *               email: { type: string, format: email }
 *               password: { type: string, description: "Solo si is_new_company=true" }
 *               company_id: { type: string, description: "Opcional si el token ya trae company_id" }
 *               skip_company_validation: { type: boolean, default: false }
 *               is_new_company: { type: boolean, default: false }
 *             required: [full_name, document, role, contact, email]
 *     responses:
 *       201:
 *         description: Usuario registrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 */
router.post("/register", CoordinadorAuth, usersController.register_user.bind(usersController));

// Subida de documentos de conductor
/**
 * @openapi
 * /users/driver-documents:
 *   post:
 *     tags: [Users]
 *     summary: Subir documentos del conductor (multipart)
 *     description: |
 *       Sube cédula y licencia (frontal/trasera). Requiere rol `operador` (o conductor según lógica del controlador).
 *       Campos de archivos: `document_front`, `document_back`, `license_front`, `license_back`.
 *     security:
 *       - sessionCookie: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               driver_id: { type: string, description: "Si el token es conductor, se ignora y se usa su propio id" }
 *               licencia_conduccion_categoria: { type: string }
 *               licencia_conduccion_vencimiento: { type: string, format: date-time }
 *               seguridad_social_vencimiento: { type: string, format: date-time }
 *               document_front: { type: string, format: binary }
 *               document_back: { type: string, format: binary }
 *               license_front: { type: string, format: binary }
 *               license_back: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Documentos subidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 */
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

// Obtener documentos de conductor
/**
 * @openapi
 * /users/driver/{driver_id}/documents:
 *   get:
 *     tags: [Users]
 *     summary: Obtener documentos del conductor
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: driver_id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Documentos del conductor
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data: { type: object }
 *               required: [message, data]
 */
router.get(
    "/driver/:driver_id/documents",
    OperadorAuth,
    usersController.get_driver_documents.bind(usersController)
);

// Actualizar perfil legal del conductor (campos de la segunda imagen) - JSON
/**
 * @openapi
 * /users/driver/{driver_id}/profile:
 *   put:
 *     tags: [Users]
 *     summary: Actualizar perfil legal del conductor (JSON)
 *     description: |
 *       Actualiza campos legales/HR/SST/IPS/inducción del conductor.
 *       El controlador normaliza fechas (si vienen en string).
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: driver_id
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
 *         description: Perfil actualizado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data: { type: object }
 *               required: [message, data]
 */
router.put(
    "/driver/:driver_id/profile",
    OperadorAuth,
    usersController.update_driver_profile.bind(usersController)
);

// Descargar ficha técnica del conductor (PDF)
/**
 * @openapi
 * /users/driver/{driver_id}/technical-sheet-pdf:
 *   get:
 *     tags: [Users]
 *     summary: Descargar ficha técnica del conductor (PDF)
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: driver_id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: PDF generado
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get(
    "/driver/:driver_id/technical-sheet-pdf",
    OperadorAuth,
    usersController.download_driver_technical_sheet_pdf.bind(usersController)
);

// Obtener todos los usuarios
/**
 * @openapi
 * /users:
 *   get:
 *     tags: [Users]
 *     summary: Listar usuarios (superadmin/admin/coordinador/contabilidad/calidad)
 *     description: |
 *       - Superadmin puede ver todos los usuarios del sistema (puede filtrar por company_id si lo especifica).
 *       - Otros roles (admin, coordinador, contabilidad, calidad) solo pueden ver usuarios de su company_id.
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
 *         name: email
 *         schema: { type: string }
 *       - in: query
 *         name: company_id
 *         schema: { type: string }
 *         description: Solo superadmin puede usar este filtro. Otros roles verán solo su company_id.
 *       - in: query
 *         name: role
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Usuarios paginados
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     users: { type: array, items: { type: object } }
 *                     pagination: { $ref: '#/components/schemas/UsersPagination' }
 *               required: [message, data]
 */
router.get("/", UsersReadAuth, usersController.get_all_users.bind(usersController));

// Obtener usuarios de una compañía específica
/**
 * @openapi
 * /users/company/{company_id}:
 *   get:
 *     tags: [Users]
 *     summary: Listar usuarios de una compañía (superadmin/admin/coordinador/contabilidad/calidad)
 *     description: |
 *       - Superadmin puede consultar usuarios de cualquier compañía.
 *       - Otros roles solo pueden consultar usuarios de su propia company_id.
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: company_id
 *         required: true
 *         schema: { type: string }
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
 *         name: email
 *         schema: { type: string }
 *       - in: query
 *         name: role
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Usuarios paginados por compañía
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     users: { type: array, items: { type: object } }
 *                     pagination: { $ref: '#/components/schemas/UsersPagination' }
 *               required: [message, data]
 */
router.get("/company/:company_id", UsersReadAuth, usersController.get_all_users_company.bind(usersController));

// Obtener usuario por ID
/**
 * @openapi
 * /users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Obtener usuario por ID (superadmin/admin/coordinador/contabilidad/calidad)
 *     description: |
 *       - Superadmin puede consultar cualquier usuario.
 *       - Otros roles solo pueden consultar usuarios de su propia company_id.
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Usuario
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data: { type: object }
 *               required: [message, data]
 *       403:
 *         description: No tienes permisos para consultar usuarios de otra compañía
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/:id", UsersReadAuth, usersController.get_user_by_id.bind(usersController));

// Actualizar información de usuario
/**
 * @openapi
 * /users/{id}:
 *   put:
 *     tags: [Users]
 *     summary: Actualizar usuario (coordinador)
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
 *               contact: { type: object }
 *             required: [full_name, contact]
 *     responses:
 *       200:
 *         description: Actualizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 */
router.put("/:id", CoordinadorAuth, usersController.update_user_info.bind(usersController));

// Actualizar avatar de usuario
/**
 * @openapi
 * /users/{id}/avatar:
 *   put:
 *     tags: [Users]
 *     summary: Actualizar avatar (multipart)
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               avatar: { type: string, format: binary }
 *             required: [avatar]
 *     responses:
 *       200:
 *         description: Avatar actualizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 */
router.put(
    "/:id/avatar",
    CoordinadorAuth,
    upload.single("avatar"),
    usersController.update_user_avatar.bind(usersController)
);

// Actualizar documentos de conductor
/**
 * @openapi
 * /users/driver/{driver_id}/documents:
 *   put:
 *     tags: [Users]
 *     summary: Actualizar documentos del conductor (multipart)
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: driver_id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               licencia_conduccion_categoria: { type: string }
 *               licencia_conduccion_vencimiento: { type: string, format: date-time }
 *               seguridad_social_vencimiento: { type: string, format: date-time }
 *               document_front: { type: string, format: binary }
 *               document_back: { type: string, format: binary }
 *               license_front: { type: string, format: binary }
 *               license_back: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Documentos actualizados
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 */
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
/**
 * @openapi
 * /users/{id}/status:
 *   patch:
 *     tags: [Users]
 *     summary: Cambiar estado activo (admin)
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Estado cambiado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 */
router.patch("/:id/status", AdminAut, usersController.change_active_status.bind(usersController));

// Eliminar usuario (soft delete)
/**
 * @openapi
 * /users/{id}:
 *   delete:
 *     tags: [Users]
 *     summary: Eliminar usuario (soft delete, admin)
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Usuario eliminado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 */
router.delete("/:id", AdminAut, usersController.delete_user.bind(usersController));

export default router;

