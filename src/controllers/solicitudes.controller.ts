import { Request, Response } from "express";
import { SolicitudesService } from "@/services/solicitudes.service";
import { ResponseError } from "@/utils/errors";
import { AuthRequest } from "@/utils/express";

export class SolicitudesController {
    private solicitudesService = new SolicitudesService();

    public async create_solicitud_client(req: Request, res: Response) {
        try {
            const { client_id, ...payload } = req.body;
            // Client should be the authenticated user
            const user_id = (req as AuthRequest).user?._id;
            
            await this.solicitudesService.create_solicitud_by_client({ 
                client_id: user_id || client_id, 
                payload: payload as any 
            });
            res.status(201).json({ 
                message: "Solicitud creada exitosamente"
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
                message: "Error al crear solicitud"
            });
            return;
        }
    }

    public async create_solicitud_coordinator(req: Request, res: Response) {
        try {
            const { coordinator_id, ...payload } = req.body;
            const user_id = (req as AuthRequest).user?._id;

            await this.solicitudesService.create_solicitud_by_coordinator({ 
                coordinator_id: user_id || coordinator_id, 
                payload: payload as any 
            });
            res.status(201).json({ 
                message: "Solicitud creada y aprobada exitosamente"
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
                message: "Error al crear solicitud por coordinador"
            });
            return;
        }
    }

    public async accept_solicitud(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const payload = req.body;
            const company_id = (req as AuthRequest).user?.company_id;
            
            const response = await this.solicitudesService.accept_solicitud({ 
                solicitud_id: id, 
                company_id,
                payload 
            });
            res.status(200).json({
                message: "Solicitud aceptada correctamente",
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
                message: "Error al aceptar solicitud"
            });
            return;
        }
    }

    /**
     * Previsualizar información del vehículo por placa
     * Útil para mostrar al coordinador la info del conductor y propietario antes de aceptar
     */
    public async preview_vehicle_by_placa(req: Request, res: Response) {
        try {
            const { placa } = req.params;
            const company_id = (req as AuthRequest).user?.company_id;
            
            const response = await this.solicitudesService.preview_vehicle_by_placa({ 
                placa,
                company_id 
            });
            res.status(200).json({
                message: "Información del vehículo obtenida",
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
                message: "Error al obtener información del vehículo"
            });
            return;
        }
    }

    public async reject_solicitud(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const response = await this.solicitudesService.reject_solicitud({ solicitud_id: id });
            res.status(200).json({
                message: "Solicitud rechazada correctamente",
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
                message: "Error al rechazar solicitud"
            });
            return;
        }
    }

    public async start_service(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const response = await this.solicitudesService.start_service({ solicitud_id: id });
            res.status(200).json({
                message: "Servicio iniciado correctamente",
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
                message: "Error al iniciar servicio"
            });
            return;
        }
    }

    public async finish_service(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const payload = req.body;
            const response = await this.solicitudesService.finish_service({ solicitud_id: id, payload });
            res.status(200).json({
                message: "Servicio finalizado correctamente",
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
                message: "Error al finalizar servicio"
            });
            return;
        }
    }

    public async update_financial_data(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const payload = req.body;
            const response = await this.solicitudesService.update_financial_data({ solicitud_id: id, payload });
            res.status(200).json({
                message: "Datos financieros actualizados correctamente",
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
                message: "Error al actualizar datos financieros"
            });
            return;
        }
    }

    public async get_solicitud_by_id(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const response = await this.solicitudesService.get_solicitud_by_id({ id });
            res.status(200).json({
                message: "Solicitud obtenida correctamente",
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
                message: "Error al obtener solicitud"
            });
            return;
        }
    }

    public async get_all_solicitudes(req: Request, res: Response) {
        try {
            const { 
                page, limit, 
                bitacora_id, cliente_id, conductor_id, vehiculo_id,
                status, service_status, empresa,
                fecha_inicio, fecha_fin
            } = req.query;

            const user = (req as AuthRequest).user;
            let final_cliente_id = cliente_id;
            let final_conductor_id = conductor_id;

            // Apply role-based filters automatically
            if (user?.role === 'cliente') {
                final_cliente_id = user._id;
            }
            if (user?.role === 'conductor') {
                final_conductor_id = user._id;
            }

            const filters = {
                bitacora_id: bitacora_id as string,
                cliente_id: final_cliente_id as string,
                conductor_id: final_conductor_id as string,
                vehiculo_id: vehiculo_id as string,
                status: status as any,
                service_status: service_status as any,
                empresa: empresa as any,
                fecha_inicio: fecha_inicio ? new Date(fecha_inicio as string) : undefined,
                fecha_fin: fecha_fin ? new Date(fecha_fin as string) : undefined
            };

            const response = await this.solicitudesService.get_all_solicitudes({
                filters,
                page: page ? Number(page) : 1,
                limit: limit ? Number(limit) : 10
            });
            res.status(200).json({
                message: "Solicitudes obtenidas correctamente",
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
                message: "Error al obtener solicitudes"
            });
            return;
        }
    }

    /**
     * Obtener solicitudes asignadas al conductor autenticado
     */
    public async get_my_solicitudes(req: Request, res: Response) {
        try {
            const conductor_id = (req as AuthRequest).user?._id;
            
            if (!conductor_id) {
                res.status(401).json({
                    ok: false,
                    message: "No se pudo identificar al conductor"
                });
                return;
            }

            const { page, limit, service_status, fecha_inicio, fecha_fin } = req.query;

            const filters = {
                service_status: service_status as any,
                fecha_inicio: fecha_inicio ? new Date(fecha_inicio as string) : undefined,
                fecha_fin: fecha_fin ? new Date(fecha_fin as string) : undefined
            };

            const response = await this.solicitudesService.get_my_solicitudes({
                conductor_id,
                filters,
                page: page ? Number(page) : 1,
                limit: limit ? Number(limit) : 10
            });

            res.status(200).json({
                message: "Solicitudes del conductor obtenidas correctamente",
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
                message: "Error al obtener solicitudes del conductor"
            });
            return;
        }
    }

    /**
     * Obtener detalle de una solicitud asignada al conductor
     */
    public async get_my_solicitud_by_id(req: Request, res: Response) {
        try {
            const conductor_id = (req as AuthRequest).user?._id;
            const { id } = req.params;
            
            if (!conductor_id) {
                res.status(401).json({
                    ok: false,
                    message: "No se pudo identificar al conductor"
                });
                return;
            }

            const response = await this.solicitudesService.get_my_solicitud_by_id({
                conductor_id,
                solicitud_id: id
            });

            res.status(200).json({
                message: "Solicitud obtenida correctamente",
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
                message: "Error al obtener solicitud"
            });
            return;
        }
    }

    /**
     * Obtener solicitudes del cliente autenticado
     */
    public async get_client_solicitudes(req: Request, res: Response) {
        try {
            const client_id = (req as AuthRequest).user?._id;
            
            if (!client_id) {
                res.status(401).json({
                    ok: false,
                    message: "No se pudo identificar al cliente"
                });
                return;
            }

            const { page, limit, status, service_status, fecha_inicio, fecha_fin } = req.query;

            const filters = {
                status: status as any,
                service_status: service_status as any,
                fecha_inicio: fecha_inicio ? new Date(fecha_inicio as string) : undefined,
                fecha_fin: fecha_fin ? new Date(fecha_fin as string) : undefined
            };

            const response = await this.solicitudesService.get_client_solicitudes({
                client_id,
                filters,
                page: page ? Number(page) : 1,
                limit: limit ? Number(limit) : 10
            });

            res.status(200).json({
                message: "Solicitudes del cliente obtenidas correctamente",
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
                message: "Error al obtener solicitudes del cliente"
            });
            return;
        }
    }

    /**
     * Obtener detalle de una solicitud del cliente
     */
    public async get_client_solicitud_by_id(req: Request, res: Response) {
        try {
            const client_id = (req as AuthRequest).user?._id;
            const { id } = req.params;
            
            if (!client_id) {
                res.status(401).json({
                    ok: false,
                    message: "No se pudo identificar al cliente"
                });
                return;
            }

            const response = await this.solicitudesService.get_client_solicitud_by_id({
                client_id,
                solicitud_id: id
            });

            res.status(200).json({
                message: "Solicitud obtenida correctamente",
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
                message: "Error al obtener solicitud"
            });
            return;
        }
    }
}
