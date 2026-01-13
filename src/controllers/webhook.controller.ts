import { Request, Response } from "express";
import solicitudModel from "@/models/solicitud.model";
import { GLOBAL_ENV } from "@/utils/constants";
import { ResponseError } from "@/utils/errors";

export class WebhookController {
    
    public async billing_update(req: Request, res: Response) {
        try {
            // 1. Validar Seguridad
            const webhookSecret = req.headers['x-webhook-secret'];
            // Validar que el secret esté configurado y coincida
            if (!GLOBAL_ENV.WEBHOOK_SECRET || webhookSecret !== GLOBAL_ENV.WEBHOOK_SECRET) {
                console.warn(`Intento de acceso no autorizado al webhook desde ${req.ip} (Secret mismatch or not configured)`);
                throw new ResponseError(403, "Acceso denegado: Secret inválido o no configurado");
            }

            const { event, invoice_data, items } = req.body;

            // 2. Validar Estructura
            if (!items || !Array.isArray(items) || items.length === 0) {
                throw new ResponseError(400, "Payload inválido: 'items' requerido");
            }
            if (!invoice_data || !invoice_data.number) {
                 throw new ResponseError(400, "Payload inválido: 'invoice_data' incompleto");
            }

            console.log(`📡 Webhook recibido: Factura ${invoice_data.number} con ${items.length} ítems. Evento: ${event}`);

            const updatedSolicitudes: string[] = [];
            const errors: string[] = [];

            // 3. Procesar Items
            for (const item of items) {
                const solicitudId = item.reference_id;
                
                try {
                    if (!solicitudId) {
                        errors.push("Ítem sin reference_id");
                        continue;
                    }

                    const solicitud = await solicitudModel.findById(solicitudId);
                    if (!solicitud) {
                        errors.push(`Solicitud no encontrada: ${solicitudId}`);
                        continue;
                    }

                    // Actualizar estado a facturado
                    solicitud.accounting_status = "facturado";
                    solicitud.n_factura = invoice_data.number;
                    solicitud.fecha_factura = invoice_data.date ? new Date(invoice_data.date) : new Date();
                    
                    // Si se envía el status de pago, se podría actualizar algo más, pero por ahora solo facturado.
                    // Podríamos guardar el link del PDF en algún campo si existiera.
                    
                    await solicitud.save();
                    updatedSolicitudes.push(solicitudId);

                } catch (err: any) {
                    console.error(`Error procesando solicitud ${solicitudId} en webhook:`, err);
                    errors.push(`Error al actualizar ${solicitudId}: ${err.message}`);
                }
            }

            // 4. Responder
            res.status(200).json({
                ok: true,
                message: "Webhook procesado",
                processed_count: updatedSolicitudes.length,
                updated_ids: updatedSolicitudes,
                errors: errors.length > 0 ? errors : undefined
            });

        } catch (error) {
             if (error instanceof ResponseError) {
                res.status(error.statusCode).json({ ok: false, message: error.message });
                return;
            }
            console.error("Error crítico en webhook:", error);
            res.status(500).json({ ok: false, message: "Error interno procesando webhook" });
        }
    }
}
