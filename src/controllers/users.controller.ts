import { Request, Response } from "express";
import { UserService } from "@/services/users.service";
import { ResponseError } from "@/utils/errors";
import { AuthRequest } from "@/utils/express";
import cacheService from "@/utils/cache";

export class UsersController {
    private userService = new UserService();

    private parseDate(value: any): Date | undefined {
        if (!value) return undefined;
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return undefined;
        return d;
    }

    public async register_user(req: Request, res: Response) {
        try {
            const user_company_id = (req as AuthRequest).user?.company_id;
            const company_id = user_company_id || req.body.company_id;
            
            if (!company_id) {
                res.status(400).json({
                    ok: false,
                    message: "company_id es requerido. Debe estar en el token de autenticación o en el body."
                });
                return;
            }
            
            await this.userService.create_new_user({
                payload: req.body,
                company_id: company_id,
                skip_company_validation: req.body.skip_company_validation,
                is_new_company: req.body.is_new_company || false
            });
            
            // Invalidar caché de usuarios
            await cacheService.invalidateUsersCache();
            
            res.status(201).json({
                message: "Usuario registrado exitosamente"
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            // Log del error para debugging
            console.error("Error al registrar usuario:", error);
            const errorMessage = error instanceof Error ? error.message : "Error desconocido";
            res.status(500).json({
                ok: false,
                message: `Error al registrar el usuario: ${errorMessage}`
            });
            return;
        }
    }

    public async verify_new_account_otp(req: Request, res: Response) {
        try {
            const { email, otp_recovery } = req.body;
            await this.userService.verify_new_account_otp({ email, otp_recovery });
            res.status(200).json({
                message: "Cuenta verificada correctamente"
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al verificar la cuenta"
            });
            return;
        }
    }

    public async upload_driver_documents(req: Request, res: Response) {
        try {
            const user_id = (req as AuthRequest).user?._id;
            const role = (req as AuthRequest).user?.role;
            // If user is driver, use their ID. Else use body.driver_id (admin uploading for driver)
            const driver_id = (role === 'conductor' && user_id) ? user_id : req.body.driver_id;
            const licencia_conduccion_categoria = req.body.licencia_conduccion_categoria;
            const licencia_conduccion_vencimiento = req.body.licencia_conduccion_vencimiento ? new Date(req.body.licencia_conduccion_vencimiento) : undefined;
            const seguridad_social_vencimiento = req.body.seguridad_social_vencimiento ? new Date(req.body.seguridad_social_vencimiento) : undefined;
            
            const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
            if (!files) throw new Error("No files uploaded");

            const document = {
                front: files['document_front']?.[0],
                back: files['document_back']?.[0]
            };
            const licencia_conduccion = {
                front: files['license_front']?.[0],
                back: files['license_back']?.[0]
            };

            await this.userService.upload_driver_documents({
                document,
                licencia_conduccion,
                driver_id,
                licencia_conduccion_categoria,
                licencia_conduccion_vencimiento,
                seguridad_social_vencimiento
            });
            res.status(200).json({
                message: "Documentos subidos correctamente"
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al subir documentos"
            });
            return;
        }
    }

    public async reset_password(req: Request, res: Response) {
        try {
            const { email } = req.body;
            await this.userService.reset_password({ email });
            res.status(200).json({
                message: "Proceso de reseteo de contraseña iniciado"
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al iniciar reseteo de contraseña"
            });
            return;
        }
    }

    public async verify_otp_password_reset(req: Request, res: Response) {
        try {
            const { email, otp_recovery } = req.body;
            await this.userService.verify_otp_password_reset({ email, otp_recovery });
            res.status(200).json({
                message: "Código OTP verificado"
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al verificar OTP"
            });
            return;
        }
    }

    public async update_new_password(req: Request, res: Response) {
        try {
            const { email, new_password } = req.body;
            await this.userService.update_new_password({ email, new_password });
            res.status(200).json({
                message: "Contraseña actualizada correctamente"
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al actualizar contraseña"
            });
            return;
        }
    }

    public async login(req: Request, res: Response) {
        try {
            const { email, password } = req.body;
            const response = await this.userService.login({ email, password });
            
            // Crear cookie de sesión
            res.cookie("_session_token_", response.token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
                maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
                path: "/"
            });

            res.status(200).json({
                message: "Sesión iniciada correctamente",
                data: response
            });
        } catch (error) {
            console.log(error);
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al iniciar sesión"
            });
            return;
        }
    }

    public async get_all_users(req: Request, res: Response) {
        try {
            const { page, limit, name, document, email, company_id, role } = req.query;
            const user_role = (req as AuthRequest).user?.role;
            const user_company_id = (req as AuthRequest).user?.company_id;
            
            // Si es superadmin, puede ver todos los usuarios (puede filtrar por company_id si lo especifica)
            // Si es otro rol, solo puede ver usuarios de su company_id
            let final_company_id: string | undefined;
            if (user_role === "superadmon") {
                // Superadmin puede ver todos o filtrar por company_id si lo especifica
                final_company_id = company_id as string | undefined;
            } else {
                // Otros roles solo pueden ver usuarios de su company_id
                final_company_id = user_company_id;
            }
            
            const filters = {
                name: name as string,
                document: document ? Number(document) : undefined,
                email: email as string,
                company_id: final_company_id,
                role: role as any
            };
            
            const response = await this.userService.get_all_users({
                filters,
                page: page ? Number(page) : 1,
                limit: limit ? Number(limit) : 10
            });
            res.status(200).json({
                message: "Usuarios obtenidos correctamente",
                data: response
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al obtener usuarios"
            });
            return;
        }
    }

    public async get_all_users_company(req: Request, res: Response) {
        try {
            const { page, limit, name, document, email, role } = req.query;
            const { company_id } = req.params;
            const user_role = (req as AuthRequest).user?.role;
            const user_company_id_raw = (req as AuthRequest).user?.company_id;
            
            // Normalizar company_id: si es objeto, extraer el _id; si es string, usarlo directamente
            const user_company_id = user_company_id_raw 
                ? (typeof user_company_id_raw === 'string' 
                    ? user_company_id_raw 
                    : (user_company_id_raw as any)?._id?.toString() || (user_company_id_raw as any)?.toString())
                : undefined;
            
            // Si es superadmin, puede consultar cualquier company_id
            // Si es otro rol, solo puede consultar su propia company_id
            let final_company_id: string;
            if (user_role === "superadmon") {
                final_company_id = company_id;
            } else {
                // Otros roles solo pueden consultar su propia company_id
                if (company_id && user_company_id && company_id !== user_company_id) {
                    throw new ResponseError(403, "No tienes permisos para consultar usuarios de otra compañía");
                }
                final_company_id = user_company_id || company_id;
            }
            
            const filters = {
                name: name as string,
                document: document ? Number(document) : undefined,
                email: email as string,
                role: role as any
            };

            const response = await this.userService.get_all_users_company({
                filters,
                page: page ? Number(page) : 1,
                limit: limit ? Number(limit) : 10,
                company_id: final_company_id
            });
            res.status(200).json({
                message: "Usuarios de la compañía obtenidos correctamente",
                data: response
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al obtener usuarios de la compañía"
            });
            return;
        }
    }

    public async get_user_by_id(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const user_role = (req as AuthRequest).user?.role;
            const user_company_id = (req as AuthRequest).user?.company_id;
            
            const response = await this.userService.get_user_by_id({ id });
            
            // Si no es superadmin, validar que el usuario consultado pertenezca a su company_id
            if (user_role !== "superadmon") {
                const userCompanyId = (response as any)?.company_id?.toString();
                const authCompanyId = user_company_id?.toString();
                
                if (userCompanyId !== authCompanyId) {
                    throw new ResponseError(403, "No tienes permisos para consultar usuarios de otra compañía");
                }
            }
            
            res.status(200).json({
                message: "Usuario obtenido correctamente",
                data: response
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al obtener el usuario"
            });
            return;
        }
    }

    public async update_user_info(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { full_name, contact } = req.body;
            await this.userService.update_user_info({ full_name, contact, id });
            
            // Invalidar caché de usuarios (específico y general)
            await cacheService.invalidateUsersCache(id);
            
            res.status(200).json({
                message: "Información del usuario actualizada"
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al actualizar información del usuario"
            });
            return;
        }
    }

    public async update_user_avatar(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const file = req.file;
            if (!file) throw new Error("No image uploaded");

            await this.userService.update_user_avatar({ new_avatar: file, id });
            
            // Invalidar caché de usuarios (específico y general)
            await cacheService.invalidateUsersCache(id);
            
            res.status(200).json({
                message: "Avatar actualizado correctamente"
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al actualizar avatar"
            });
            return;
        }
    }

    public async update_driver_documents(req: Request, res: Response) {
        try {
            const user_id = (req as AuthRequest).user?._id;
            const role = (req as AuthRequest).user?.role;
            const { driver_id } = req.params;
            const licencia_conduccion_categoria = req.body.licencia_conduccion_categoria;
            const licencia_conduccion_vencimiento = req.body.licencia_conduccion_vencimiento ? new Date(req.body.licencia_conduccion_vencimiento) : undefined;
            const seguridad_social_vencimiento = req.body.seguridad_social_vencimiento ? new Date(req.body.seguridad_social_vencimiento) : undefined;
            
            // If user is driver, ignore params driver_id and use their own
            const target_driver_id = (role === 'conductor' && user_id) ? user_id : driver_id;
            
            const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
            
            // Los archivos son opcionales en la actualización
            const document = {
                front: files?.['document_front']?.[0],
                back: files?.['document_back']?.[0]
            };
            const licencia_conduccion = {
                front: files?.['license_front']?.[0],
                back: files?.['license_back']?.[0]
            };
            
            // Verificar que al menos se esté actualizando algo
            const hasFiles = document.front || document.back || licencia_conduccion.front || licencia_conduccion.back;
            const hasMetadata = licencia_conduccion_categoria || licencia_conduccion_vencimiento || seguridad_social_vencimiento;
            
            if (!hasFiles && !hasMetadata) {
                res.status(400).json({
                    ok: false,
                    message: "Debe proporcionar al menos un archivo o metadato para actualizar"
                });
                return;
            }

            await this.userService.update_driver_documents({
                document,
                licencia_conduccion,
                driver_id: target_driver_id,
                licencia_conduccion_categoria,
                licencia_conduccion_vencimiento,
                seguridad_social_vencimiento
            });
            res.status(200).json({
                message: "Documentos actualizados correctamente"
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            // Log del error para debugging
            console.error("Error al actualizar documentos:", error);
            const errorMessage = error instanceof Error ? error.message : "Error desconocido";
            res.status(500).json({
                ok: false,
                message: `Error al actualizar documentos: ${errorMessage}`
            });
            return;
        }
    }

    public async get_driver_documents(req: Request, res: Response) {
        try {
            const user_id = (req as AuthRequest).user?._id;
            const role = (req as AuthRequest).user?.role;
            const { driver_id } = req.params;
            const target_driver_id = (role === 'conductor' && user_id) ? user_id : driver_id;

            const docs = await this.userService.get_driver_documents({ driver_id: target_driver_id });
            res.status(200).json({
                message: "Documentos del conductor obtenidos correctamente",
                data: docs
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al obtener documentos del conductor"
            });
            return;
        }
    }

    /**
     * Actualiza el "perfil legal" del conductor (campos de la segunda imagen)
     * NOTA: Este endpoint es JSON (sin archivos).
     */
    public async update_driver_profile(req: Request, res: Response) {
        try {
            const user_id = (req as AuthRequest).user?._id;
            const role = (req as AuthRequest).user?.role;
            const { driver_id } = req.params;
            const target_driver_id = (role === 'conductor' && user_id) ? user_id : driver_id;

            const body = req.body || {};

            // Normalizar fechas conocidas (top-level)
            const payload: any = {
                ...body,
                licencia_conduccion_expedicion: this.parseDate(body.licencia_conduccion_expedicion),
                licencia_conduccion_vencimiento: this.parseDate(body.licencia_conduccion_vencimiento),
                fecha_nacimiento: this.parseDate(body.fecha_nacimiento),
                fecha_vinculacion: this.parseDate(body.fecha_vinculacion),
            };

            // Normalizar fechas en SST (si viene)
            if (body.sst) {
                const sst = { ...body.sst };
                const normalizeItem = (item: any) => item ? ({ ...item, cobertura: this.parseDate(item.cobertura) }) : item;
                sst.eps = normalizeItem(sst.eps);
                sst.arl = normalizeItem(sst.arl);
                sst.riesgos_profesionales = normalizeItem(sst.riesgos_profesionales);
                sst.fondo_pensiones = normalizeItem(sst.fondo_pensiones);
                sst.caja_compensacion = normalizeItem(sst.caja_compensacion);
                payload.sst = sst;
            }

            // Normalizar fechas en IPS examen médico (si viene)
            if (body.ips_examen_medico) {
                payload.ips_examen_medico = {
                    ...body.ips_examen_medico,
                    fecha_ultimo_examen: this.parseDate(body.ips_examen_medico.fecha_ultimo_examen),
                    fecha_vencimiento_examen: this.parseDate(body.ips_examen_medico.fecha_vencimiento_examen),
                    fecha_vencimiento_recomendaciones: this.parseDate(body.ips_examen_medico.fecha_vencimiento_recomendaciones),
                };
            }

            // Normalizar fechas en Inducción (si viene)
            if (body.induccion) {
                payload.induccion = {
                    ...body.induccion,
                    fecha_induccion: this.parseDate(body.induccion.fecha_induccion),
                    fecha_reinduccion: this.parseDate(body.induccion.fecha_reinduccion),
                };
            }

            // Normalizar tipo_sangre (convertir a mayúsculas)
            if (payload.tipo_sangre !== undefined && typeof payload.tipo_sangre === 'string') {
                payload.tipo_sangre = payload.tipo_sangre.toUpperCase();
            }

            // Normalizar genero (convertir "masculino"/"femenino" a "M"/"F")
            if (payload.genero !== undefined && typeof payload.genero === 'string') {
                const generoLower = payload.genero.toLowerCase();
                if (generoLower === 'masculino' || generoLower === 'm' || generoLower === 'male') {
                    payload.genero = 'M';
                } else if (generoLower === 'femenino' || generoLower === 'f' || generoLower === 'female') {
                    payload.genero = 'F';
                } else if (generoLower === 'otro' || generoLower === 'other') {
                    payload.genero = 'Otro';
                }
                // Si no coincide con ninguno, mantener el valor original (puede ser "M", "F", "Otro" ya)
            }

            const updated = await this.userService.update_driver_profile({
                driver_id: target_driver_id,
                payload
            });

            res.status(200).json({
                message: "Perfil del conductor actualizado correctamente",
                data: updated
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al actualizar perfil del conductor"
            });
            return;
        }
    }

    public async download_driver_technical_sheet_pdf(req: Request, res: Response) {
        try {
            const user_id = (req as AuthRequest).user?._id;
            const role = (req as AuthRequest).user?.role;
            const { driver_id } = req.params;
            const target_driver_id = (role === 'conductor' && user_id) ? user_id : driver_id;

            const { filename, buffer } = await this.userService.generate_driver_technical_sheet_pdf({
                driver_id: target_driver_id
            });

            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
            res.status(200).send(buffer);
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al generar ficha técnica del conductor"
            });
            return;
        }
    }

    public async change_active_status(req: Request, res: Response) {
        try {
            const { id } = req.params;
            await this.userService.change_active_status({ id });
            res.status(200).json({
                message: "Estado activo cambiado correctamente"
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al cambiar estado activo"
            });
            return;
        }
    }

    public async delete_user(req: Request, res: Response) {
        try {
            const { id } = req.params;
            await this.userService.delete_user({ user_id: id });
            
            // Invalidar caché de usuarios (específico y general)
            await cacheService.invalidateUsersCache(id);
            
            res.status(200).json({
                message: "Usuario eliminado correctamente"
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al eliminar usuario"
            });
            return;
        }
    }

    // #========== SESSION METHODS ==========#

    public async get_me(req: Request, res: Response) {
        try {
            const user = (req as AuthRequest).user;
            if (!user) {
                res.status(401).json({
                    ok: false,
                    message: "No hay sesión activa"
                });
                return;
            }

            const response = await this.userService.get_user_by_id({ id: user._id });
            res.status(200).json({
                message: "Sesión válida",
                data: response
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al obtener la sesión"
            });
            return;
        }
    }

    public async refresh_session(req: Request, res: Response) {
        try {
            const user = (req as AuthRequest).user;
            if (!user) {
                res.status(401).json({
                    ok: false,
                    message: "No hay sesión activa"
                });
                return;
            }

            // Obtener datos actualizados del usuario
            const userData = await this.userService.get_user_by_id({ id: user._id });
            
            // Generar nuevo token
            const { generate_token_session } = await import("@/utils/generate");
            const newToken = generate_token_session({ 
                id: user._id, 
                role: userData.role 
            });

            // Crear nueva cookie de sesión
            res.cookie("_session_token_", newToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
                maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
                path: "/"
            });

            res.status(200).json({
                message: "Sesión renovada exitosamente",
                data: {
                    token: newToken,
                    user: userData
                }
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al renovar la sesión"
            });
            return;
        }
    }

    public async logout(req: Request, res: Response) {
        try {
            // Eliminar la cookie de sesión
            res.clearCookie("_session_token_", {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
                path: "/"
            });

            res.status(200).json({
                message: "Sesión cerrada exitosamente"
            });
        } catch (error) {
            res.status(500).json({
                ok: false,
                message: "Error al cerrar sesión"
            });
            return;
        }
    }
}
