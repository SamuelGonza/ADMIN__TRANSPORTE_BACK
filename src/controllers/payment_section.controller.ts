import { Request, Response } from "express";
import { PaymentSectionService } from "@/services/payment_section.service";
import { ResponseError } from "@/utils/errors";
import { AuthRequest } from "@/utils/express";

export class PaymentSectionController {
    private paymentSectionService = new PaymentSectionService();

    public async get_payment_section_by_solicitud(req: Request, res: Response) {
        try {
            const { solicitud_id } = req.params;
            
            if (!solicitud_id) {
                res.status(400).json({
                    ok: false,
                    message: "solicitud_id es requerido"
                });
                return;
            }

            const paymentSection = await this.paymentSectionService.get_payment_section_by_solicitud({
                solicitud_id
            });

            if (!paymentSection) {
                res.status(404).json({
                    ok: false,
                    message: "No se encontró sección de pagos para esta solicitud"
                });
                return;
            }

            res.status(200).json({
                message: "Sección de pagos obtenida correctamente",
                data: paymentSection
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
                message: "Error al obtener la sección de pagos"
            });
            return;
        }
    }

    public async update_cuenta_cobro(req: Request, res: Response) {
        try {
            const { paymentSectionId, vehiculoId } = req.params;
            const { solicitud_id, vehiculo_id, valor_base, gastos_operacionales, gastos_preoperacionales } = req.body;
            const user_id = (req as AuthRequest).user?._id;

            // Validaciones básicas
            if (!paymentSectionId || !vehiculoId) {
                res.status(400).json({
                    ok: false,
                    message: "paymentSectionId y vehiculoId son requeridos en los parámetros de ruta"
                });
                return;
            }

            if (!solicitud_id || !vehiculo_id || valor_base === undefined) {
                res.status(400).json({
                    ok: false,
                    message: "solicitud_id, vehiculo_id y valor_base son requeridos en el body"
                });
                return;
            }

            const paymentSection = await this.paymentSectionService.update_cuenta_cobro_by_ids({
                paymentSectionId,
                vehiculoId,
                solicitud_id,
                vehiculo_id,
                valor_base,
                gastos_operacionales,
                gastos_preoperacionales,
                updated_by: user_id
            });

            res.status(200).json({
                success: true,
                data: paymentSection
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
                message: "Error al actualizar la cuenta de cobro"
            });
            return;
        }
    }
}

