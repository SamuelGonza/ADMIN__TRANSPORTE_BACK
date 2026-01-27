import { Request, Response } from "express";
import { ResponseError } from "@/utils/errors";
import { AuthRequest } from "@/utils/express";
import { PreliquidacionService } from "@/services/preliquidacion.service";

export class PreliquidacionController {
    private preliquidacionService: PreliquidacionService;

    constructor() {
        this.preliquidacionService = new PreliquidacionService();
    }

    /**
     * Generar preliquidación en masa
     */
    public async generate_preliquidacion(req: Request, res: Response) {
        try {
            const { solicitudes_ids, gastos_operacionales_ids, gastos_preoperacionales_ids } = req.body;
            const user_id = (req as AuthRequest).user?._id;
            const company_id = (req as AuthRequest).user?.company_id;

            if (!user_id || !company_id) {
                return res.status(401).json({
                    ok: false,
                    message: "No se pudo identificar al usuario o la compañía"
                });
            }

            const response = await this.preliquidacionService.generate_preliquidacion({
                solicitudes_ids,
                gastos_operacionales_ids: gastos_operacionales_ids || [],
                gastos_preoperacionales_ids: gastos_preoperacionales_ids || [],
                user_id,
                company_id
            });

            res.status(200).json({
                ok: true,
                message: response.message,
                data: response.preliquidacion
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
                message: "Error al generar preliquidación"
            });
            return;
        }
    }

    /**
     * Aprobar preliquidación (rol contabilidad)
     */
    public async approve_preliquidacion(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { notas } = req.body;
            const user_id = (req as AuthRequest).user?._id;

            if (!user_id) {
                return res.status(401).json({
                    ok: false,
                    message: "No se pudo identificar al usuario"
                });
            }

            const response = await this.preliquidacionService.approve_preliquidacion({
                preliquidacion_id: id,
                user_id,
                notas
            });

            res.status(200).json({
                ok: true,
                message: response.message,
                data: response.preliquidacion
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
                message: "Error al aprobar preliquidación"
            });
            return;
        }
    }

    /**
     * Rechazar preliquidación (rol contabilidad)
     */
    public async reject_preliquidacion(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { notas } = req.body;
            const user_id = (req as AuthRequest).user?._id;

            if (!user_id) {
                return res.status(401).json({
                    ok: false,
                    message: "No se pudo identificar al usuario"
                });
            }

            const response = await this.preliquidacionService.reject_preliquidacion({
                preliquidacion_id: id,
                user_id,
                notas
            });

            res.status(200).json({
                ok: true,
                message: response.message,
                data: response.preliquidacion
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
                message: "Error al rechazar preliquidación"
            });
            return;
        }
    }

    /**
     * Descargar PDF de preliquidación
     */
    public async download_preliquidacion_pdf(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { filename, buffer } = await this.preliquidacionService.generate_preliquidacion_pdf({
                preliquidacion_id: id
            });

            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
            res.status(200).send(buffer);
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
                message: "Error al generar el PDF de preliquidación"
            });
            return;
        }
    }

    /**
     * Enviar preliquidación al cliente (puede enviarse en cualquier momento)
     */
    public async send_preliquidacion_to_client(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { notas } = req.body;
            const user_id = (req as AuthRequest).user?._id;

            if (!user_id) {
                return res.status(401).json({
                    ok: false,
                    message: "No se pudo identificar al usuario"
                });
            }

            const response = await this.preliquidacionService.send_preliquidacion_to_client({
                preliquidacion_id: id,
                user_id,
                notas
            });

            res.status(200).json({
                ok: true,
                message: response.message
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
                message: "Error al enviar preliquidación al cliente"
            });
            return;
        }
    }

    /**
     * Obtener vehículos y gastos operacionales al seleccionar servicios
     */
    public async get_vehicles_and_expenses(req: Request, res: Response) {
        try {
            const { solicitudes_ids } = req.body;
            
            if (!solicitudes_ids || !Array.isArray(solicitudes_ids) || solicitudes_ids.length === 0) {
                return res.status(400).json({
                    ok: false,
                    message: "Debe proporcionar un array de IDs de solicitudes"
                });
            }

            const response = await this.preliquidacionService.get_vehicles_and_expenses({
                solicitudes_ids
            });

            res.status(200).json({
                ok: true,
                message: "Vehículos y gastos obtenidos exitosamente",
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
                message: "Error al obtener vehículos y gastos"
            });
            return;
        }
    }

    /**
     * Obtener gastos pendientes de las solicitudes seleccionadas
     */
    public async get_pending_expenses(req: Request, res: Response) {
        try {
            const { solicitudes_ids } = req.body;
            
            // Si viene como string (por query param), parsearlo
            let ids = solicitudes_ids;
            if (!ids && req.query.solicitudes_ids) {
                try {
                    ids = JSON.parse(req.query.solicitudes_ids as string);
                } catch (e) {
                    ids = [req.query.solicitudes_ids];
                }
            }

            const response = await this.preliquidacionService.get_pending_expenses({
                solicitudes_ids: ids || []
            });

            res.status(200).json({
                ok: true,
                message: "Gastos pendientes obtenidos exitosamente",
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
                message: "Error al obtener gastos pendientes"
            });
            return;
        }
    }

    /**
     * Listar todas las preliquidaciones con paginación
     */
    public async list_preliquidaciones(req: Request, res: Response) {
        try {
            const { page, limit, estado } = req.query;
            const company_id = (req as AuthRequest).user?.company_id;

            const response = await this.preliquidacionService.list_preliquidaciones({
                page: page ? Number(page) : 1,
                limit: limit ? Number(limit) : 10,
                estado: estado as any,
                company_id: company_id as string
            });

            res.status(200).json({
                ok: true,
                message: "Preliquidaciones obtenidas correctamente",
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
                message: "Error al listar preliquidaciones"
            });
            return;
        }
    }
}
