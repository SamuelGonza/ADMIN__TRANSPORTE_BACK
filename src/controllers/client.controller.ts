import { Request, Response } from "express";
import { ClientService } from "@/services/client.service";
import { ResponseError } from "@/utils/errors";
import { AuthRequest } from "@/utils/express";

export class ClientController {
    private clientService = new ClientService();

    public async create_client(req: Request, res: Response) {
        try {
            const { company_id, contract, ...payload } = req.body;
            const user_company_id = (req as AuthRequest).user?.company_id;
            const created_by = (req as AuthRequest).user?._id;
            
            await this.clientService.create_client({ 
                payload: payload as any, 
                company_id: user_company_id || company_id,
                created_by,
                contract_data: contract // Datos opcionales del contrato
            });
            res.status(201).json({ 
                message: contract ? "Cliente y contrato creados exitosamente" : "Cliente creado exitosamente"
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
                message: "Error al crear el cliente"
            });
            return;
        }
    }

    public async login(req: Request, res: Response) {
        try {
            const { email, password } = req.body;
            const response = await this.clientService.login({ email, password });
            
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

    public async get_all_clients(req: Request, res: Response) {
        try {
            const { page, limit, company_id, name, email, contact_name, contact_phone } = req.query;
            const company_id_user = (req as AuthRequest).user?.company_id;
            
            // Asegurar que company_id sea siempre un string (ID), no un objeto
            let final_company_id: string | undefined;
            if (company_id_user) {
                // Si es un objeto, extraer el _id, si es string, usarlo directamente
                final_company_id = typeof company_id_user === 'string' 
                    ? company_id_user 
                    : (company_id_user as any)?._id?.toString() || (company_id_user as any)?.toString();
            } else if (company_id) {
                final_company_id = typeof company_id === 'string' 
                    ? company_id 
                    : (company_id as any)?._id?.toString() || (company_id as any)?.toString();
            }
            
            const filters = {
                company_id: final_company_id,
                name: name as string,
                email: email as string,
                contact_name: contact_name as string,
                contact_phone: contact_phone as string
            };

            const response = await this.clientService.get_all_clients({
                filters,
                page: page ? Number(page) : 1,
                limit: limit ? Number(limit) : 10
            });
            res.status(200).json({
                message: "Clientes obtenidos correctamente",
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
                message: "Error al obtener clientes"
            });
            return;
        }
    }

    public async get_client_by_id(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const response = await this.clientService.get_client_by_id({ id });
            res.status(200).json({
                message: "Cliente obtenido correctamente",
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
                message: "Error al obtener el cliente"
            });
            return;
        }
    }

    public async update_client_info(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const payload = req.body;
            await this.clientService.update_client_info({ id, payload });
            res.status(200).json({ 
                message: "Información del cliente actualizada"
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
                message: "Error al actualizar la información del cliente"
            });
            return;
        }
    }

    public async reset_client_password(req: Request, res: Response) {
        try {
            const { id } = req.params;
            await this.clientService.reset_client_password({ id });
            res.status(200).json({ 
                message: "Contraseña reseteada exitosamente"
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
                message: "Error al resetear la contraseña"
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

            const response = await this.clientService.get_client_by_id({ id: user._id });
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

            // Obtener datos actualizados del cliente
            const clientData = await this.clientService.get_client_by_id({ id: user._id });
            
            // Extraer company_id correctamente (puede ser ObjectId, string, o objeto populado)
            let clientCompanyId: string | undefined;
            if (clientData.company_id) {
                if (typeof clientData.company_id === 'string') {
                    clientCompanyId = clientData.company_id;
                } else if (typeof clientData.company_id === 'object') {
                    // Si es un objeto, extraer el _id
                    const obj = clientData.company_id as any;
                    if (obj._id) {
                        clientCompanyId = typeof obj._id === 'object' && obj._id.toString
                            ? obj._id.toString()
                            : String(obj._id);
                    } else {
                        // Si no tiene _id, intentar convertir directamente
                        clientCompanyId = String(obj);
                    }
                } else {
                    clientCompanyId = String(clientData.company_id);
                }
            }
            
            // Generar nuevo token
            const { generate_token_session } = await import("@/utils/generate");
            const newToken = generate_token_session({ 
                id: user._id, 
                role: "cliente" as any,
                company_id: clientCompanyId
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
                    client: clientData
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
