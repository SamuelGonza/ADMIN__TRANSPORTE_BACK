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
     * Enviar preliquidación al cliente (solo si está aprobada)
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
}
