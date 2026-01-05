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
            const accepted_by = (req as AuthRequest).user?._id;
            
            const response = await this.solicitudesService.accept_solicitud({ 
                solicitud_id: id, 
                company_id,
                accepted_by,
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

    /**
     * Sugerir asignación multi-vehículo (plan temporal)
     * Body: { requested_passengers: number, preferred_seats?: number, vehicle_type?: string }
     */
    public async suggest_vehicle_allocation(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { requested_passengers, preferred_seats, vehicle_type } = req.body;
            const company_id = (req as AuthRequest).user?.company_id;

            const response = await this.solicitudesService.suggest_vehicle_allocation({
                solicitud_id: id,
                company_id,
                requested_passengers: Number(requested_passengers),
                preferred_seats: preferred_seats !== undefined ? Number(preferred_seats) : undefined,
                vehicle_type
            });

            res.status(200).json({
                message: "Sugerencia generada correctamente",
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
                message: "Error al sugerir asignación de vehículos"
            });
            return;
        }
    }

    /**
     * Buscar vehículos disponibles para una cantidad de pasajeros
     * Devuelve vehículos disponibles y en servicio (con flag)
     */
    public async find_vehicles_for_passengers(req: Request, res: Response) {
        try {
            const { requested_passengers, fecha, hora_inicio, vehicle_type } = req.body;
            const company_id = (req as AuthRequest).user?.company_id;

            if (!company_id) {
                res.status(401).json({
                    ok: false,
                    message: "No se pudo identificar la compañía del usuario"
                });
                return;
            }

            if (!requested_passengers || !fecha || !hora_inicio) {
                res.status(400).json({
                    ok: false,
                    message: "requested_passengers, fecha y hora_inicio son requeridos"
                });
                return;
            }

            const response = await this.solicitudesService.find_vehicles_for_passengers({
                company_id,
                requested_passengers: Number(requested_passengers),
                fecha: new Date(fecha),
                hora_inicio,
                vehicle_type
            });

            res.status(200).json({
                message: "Vehículos encontrados correctamente",
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
                message: "Error al buscar vehículos disponibles"
            });
            return;
        }
    }

    /**
     * Confirmar asignación multi-vehículo y persistirla en la solicitud
     * Body: { requested_passengers: number, assignments: [{vehiculo_id, conductor_id, assigned_passengers}] }
     */
    public async assign_multiple_vehicles(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { requested_passengers, assignments } = req.body;
            const company_id = (req as AuthRequest).user?.company_id;
            const assigned_by = (req as AuthRequest).user?._id;

            const response = await this.solicitudesService.assign_multiple_vehicles({
                solicitud_id: id,
                company_id,
                assigned_by,
                requested_passengers: Number(requested_passengers),
                assignments: assignments as any
            });

            res.status(200).json({
                message: "Asignación multi-vehículo confirmada",
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
                message: "Error al confirmar asignación multi-vehículo"
            });
            return;
        }
    }

    /**
     * Descargar PDF de manifiesto de pasajeros (1 vehículo) para imprimir.
     */
    public async download_passenger_manifest_pdf(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { filename, buffer } = await this.solicitudesService.generate_passenger_manifest_pdf({
                solicitud_id: id
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
                message: "Error al generar el PDF"
            });
            return;
        }
    }

    /**
     * Contabilidad: actualizar bloque contable por bus asignado (vehiculo_id)
     */
    public async update_assignment_accounting(req: Request, res: Response) {
        try {
            const { id, vehiculo_id } = req.params as any;
            const payload = req.body;

            const response = await this.solicitudesService.update_assignment_accounting({
                solicitud_id: id,
                vehiculo_id,
                payload
            });

            res.status(200).json({
                message: "Contabilidad del bus actualizada correctamente",
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
                message: "Error al actualizar contabilidad del bus"
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

    public async calcular_liquidacion(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const response = await this.solicitudesService.calcular_liquidacion({ solicitud_id: id });
            res.status(200).json(response);
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
                message: "Error al calcular liquidación"
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
            const user_role = (req as AuthRequest).user?.role;
            const response = await this.solicitudesService.get_solicitud_by_id({ id, user_role });
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
                limit: limit ? Number(limit) : 10,
                user_role: user?.role
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
     * Establecer valores financieros (solo comercial)
     */
    public async set_financial_values(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { valor_a_facturar, valor_cancelado } = req.body;
            const comercial_id = (req as AuthRequest).user?._id;

            if (!valor_a_facturar || !valor_cancelado) {
                res.status(400).json({
                    ok: false,
                    message: "valor_a_facturar y valor_cancelado son requeridos"
                });
                return;
            }

            const response = await this.solicitudesService.set_financial_values_by_comercial({
                solicitud_id: id,
                comercial_id: comercial_id as string,
                payload: {
                    valor_a_facturar: Number(valor_a_facturar),
                    valor_cancelado: Number(valor_cancelado)
                }
            });

            res.status(200).json({
                message: "Valores financieros establecidos correctamente",
                data: response
            });
        } catch (error) {
            if (error instanceof ResponseError) {
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al establecer valores financieros"
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
