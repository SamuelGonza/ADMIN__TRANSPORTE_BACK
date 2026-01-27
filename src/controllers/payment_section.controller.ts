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
            const { solicitud_id, vehiculo_id, valor_base, pago_vehiculo, gastos_operacionales, gastos_preoperacionales } = req.body;
            const user_id = (req as AuthRequest).user?._id;

            // Validaciones básicas
            if (!paymentSectionId || !vehiculoId) {
                res.status(400).json({
                    ok: false,
                    message: "paymentSectionId y vehiculoId son requeridos en los parámetros de ruta"
                });
                return;
            }

            if (!solicitud_id || !vehiculo_id) {
                res.status(400).json({
                    ok: false,
                    message: "solicitud_id y vehiculo_id son requeridos en el body"
                });
                return;
            }

            // Validar pago_vehiculo si se envía
            if (pago_vehiculo) {
                if (!pago_vehiculo.tipo_contrato || !pago_vehiculo.pricing_mode || pago_vehiculo.tarifa === undefined) {
                    res.status(400).json({
                        ok: false,
                        message: "pago_vehiculo requiere tipo_contrato, pricing_mode y tarifa"
                    });
                    return;
                }

                const validModes = ["por_hora", "por_kilometro", "por_distancia", "por_viaje", "por_trayecto"];
                if (!validModes.includes(pago_vehiculo.pricing_mode)) {
                    res.status(400).json({
                        ok: false,
                        message: `pricing_mode debe ser uno de: ${validModes.join(", ")}`
                    });
                    return;
                }

                const validTipos = ["fijo", "ocasional"];
                if (!validTipos.includes(pago_vehiculo.tipo_contrato)) {
                    res.status(400).json({
                        ok: false,
                        message: `tipo_contrato debe ser uno de: ${validTipos.join(", ")}`
                    });
                    return;
                }
            }

            const paymentSection = await this.paymentSectionService.update_cuenta_cobro_by_ids({
                paymentSectionId,
                vehiculoId,
                solicitud_id,
                vehiculo_id,
                valor_base: valor_base !== undefined ? Number(valor_base) : 0,
                pago_vehiculo: pago_vehiculo ? {
                    tipo_contrato: pago_vehiculo.tipo_contrato,
                    pricing_mode: pago_vehiculo.pricing_mode,
                    tarifa: Number(pago_vehiculo.tarifa)
                } : undefined,
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

    /**
     * Listar todas las cuentas de cobro con paginación
     */
    public async list_cuentas_cobro(req: Request, res: Response) {
        try {
            const { page, limit, estado, flota } = req.query;
            const company_id = (req as AuthRequest).user?.company_id;

            const response = await this.paymentSectionService.list_cuentas_cobro({
                page: page ? Number(page) : 1,
                limit: limit ? Number(limit) : 10,
                estado: estado as any,
                flota: flota as any,
                company_id: company_id as string
            });

            res.status(200).json({
                ok: true,
                message: "Cuentas de cobro obtenidas correctamente",
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
                message: "Error al listar cuentas de cobro"
            });
            return;
        }
    }
}

