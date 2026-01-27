import { Request, Response } from "express";
import { ClientUserService } from "@/services/client_user.service";
import { ResponseError } from "@/utils/errors";
import { AuthRequest } from "@/utils/express";

export class ClientUserController {
    private clientUserService = new ClientUserService();

    // Método privado para verificar si el usuario es un subusuario
    private async isClientUser(user_id: string): Promise<boolean> {
        try {
            await this.clientUserService.get_client_user_by_id({ id: user_id });
            return true;
        } catch (error) {
            return false;
        }
    }

    public async create_client_user(req: Request, res: Response) {
        try {
            const { cliente_id, ...payload } = req.body;
            const user_company_id = (req as AuthRequest).user?.company_id;
            const created_by = (req as AuthRequest).user?._id;
            const user_role = (req as AuthRequest).user?.role;
            
            // Verificar si el usuario autenticado es un subusuario
            if (user_role === "cliente" && created_by) {
                const isSubUser = await this.isClientUser(created_by);
                if (isSubUser) {
                    throw new ResponseError(403, "Los subusuarios no pueden gestionar otros subusuarios");
                }
            }
            
            let final_cliente_id = cliente_id;
            
            if (user_role === "cliente") {
                // Si es un cliente principal, solo puede crear subusuarios para sí mismo
                final_cliente_id = (req as AuthRequest).user?._id;
            }
            
            if (!final_cliente_id) {
                throw new ResponseError(400, "cliente_id es requerido");
            }

            const response = await this.clientUserService.create_client_user({ 
                payload: payload as any, 
                company_id: user_company_id || req.body.company_id,
                cliente_id: final_cliente_id,
                created_by
            });
            
            res.status(201).json({ 
                message: "Subusuario del cliente creado exitosamente",
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
                message: "Error al crear el subusuario del cliente"
            });
            return;
        }
    }

    public async get_all_client_users(req: Request, res: Response) {
        try {
            const { page, limit, company_id, cliente_id, full_name, email } = req.query;
            const company_id_user = (req as AuthRequest).user?.company_id;
            const user_role = (req as AuthRequest).user?.role;
            const user_id = (req as AuthRequest).user?._id;
            
            // Verificar si el usuario autenticado es un subusuario
            if (user_role === "cliente" && user_id) {
                const isSubUser = await this.isClientUser(user_id);
                if (isSubUser) {
                    throw new ResponseError(403, "Los subusuarios no pueden ver la lista de subusuarios");
                }
            }
            
            // Si es un cliente principal autenticado, solo puede ver sus propios subusuarios
            let final_cliente_id = cliente_id as string | undefined;
            if (user_role === "cliente") {
                final_cliente_id = user_id;
            }
            
            // Asegurar que company_id sea siempre un string (ID), no un objeto
            let final_company_id: string | undefined;
            if (company_id_user) {
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
                cliente_id: final_cliente_id,
                full_name: full_name as string,
                email: email as string
            };

            const response = await this.clientUserService.get_all_client_users({
                filters,
                page: page ? Number(page) : 1,
                limit: limit ? Number(limit) : 10
            });
            
            res.status(200).json({
                message: "Subusuarios del cliente obtenidos correctamente",
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
                message: "Error al obtener los subusuarios del cliente"
            });
            return;
        }
    }

    public async get_client_user_by_id(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const user_role = (req as AuthRequest).user?.role;
            const user_id = (req as AuthRequest).user?._id;
            
            // Verificar si el usuario autenticado es un subusuario
            if (user_role === "cliente" && user_id) {
                const isSubUser = await this.isClientUser(user_id);
                if (isSubUser) {
                    throw new ResponseError(403, "Los subusuarios no pueden ver información de otros subusuarios");
                }
            }
            
            const response = await this.clientUserService.get_client_user_by_id({ id });
            
            // Si es un cliente principal, verificar que el subusuario pertenece a su cliente
            if (user_role === "cliente") {
                const clienteId = response.cliente_id 
                    ? (typeof response.cliente_id === 'string' 
                        ? response.cliente_id 
                        : (response.cliente_id as any)?._id?.toString() || (response.cliente_id as any)?.toString())
                    : null;
                
                if (clienteId !== user_id) {
                    throw new ResponseError(403, "No tienes permisos para ver este subusuario");
                }
            }
            
            res.status(200).json({
                message: "Subusuario del cliente obtenido correctamente",
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
                message: "Error al obtener el subusuario del cliente"
            });
            return;
        }
    }

    public async update_client_user_info(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const payload = req.body;
            const user_role = (req as AuthRequest).user?.role;
            const user_id = (req as AuthRequest).user?._id;
            
            // Verificar si el usuario autenticado es un subusuario
            if (user_role === "cliente" && user_id) {
                const isSubUser = await this.isClientUser(user_id);
                if (isSubUser) {
                    throw new ResponseError(403, "Los subusuarios no pueden actualizar otros subusuarios");
                }
            }
            
            // Verificar permisos si es cliente principal
            if (user_role === "cliente") {
                const clientUser = await this.clientUserService.get_client_user_by_id({ id });
                const clienteId = clientUser.cliente_id 
                    ? (typeof clientUser.cliente_id === 'string' 
                        ? clientUser.cliente_id 
                        : (clientUser.cliente_id as any)?._id?.toString() || (clientUser.cliente_id as any)?.toString())
                    : null;
                
                if (clienteId !== user_id) {
                    throw new ResponseError(403, "No tienes permisos para actualizar este subusuario");
                }
            }
            
            await this.clientUserService.update_client_user_info({ id, payload });
            res.status(200).json({ 
                message: "Información del subusuario del cliente actualizada"
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
                message: "Error al actualizar la información del subusuario del cliente"
            });
            return;
        }
    }

    public async delete_client_user(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const user_role = (req as AuthRequest).user?.role;
            const user_id = (req as AuthRequest).user?._id;
            
            // Verificar si el usuario autenticado es un subusuario
            if (user_role === "cliente" && user_id) {
                const isSubUser = await this.isClientUser(user_id);
                if (isSubUser) {
                    throw new ResponseError(403, "Los subusuarios no pueden eliminar otros subusuarios");
                }
            }
            
            // Verificar permisos si es cliente principal
            if (user_role === "cliente") {
                const clientUser = await this.clientUserService.get_client_user_by_id({ id });
                const clienteId = clientUser.cliente_id 
                    ? (typeof clientUser.cliente_id === 'string' 
                        ? clientUser.cliente_id 
                        : (clientUser.cliente_id as any)?._id?.toString() || (clientUser.cliente_id as any)?.toString())
                    : null;
                
                if (clienteId !== user_id) {
                    throw new ResponseError(403, "No tienes permisos para eliminar este subusuario");
                }
            }
            
            await this.clientUserService.delete_client_user({ id });
            res.status(200).json({ 
                message: "Subusuario del cliente eliminado exitosamente"
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
                message: "Error al eliminar el subusuario del cliente"
            });
            return;
        }
    }
}
