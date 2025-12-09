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
            const response = await this.solicitudesService.accept_solicitud({ solicitud_id: id, payload });
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
}
