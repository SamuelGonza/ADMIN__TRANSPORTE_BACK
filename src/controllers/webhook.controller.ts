import { Request, Response } from "express";
import { WebhookService } from "@/services/webhook.service";
import { GLOBAL_ENV } from "@/utils/constants";
import { ResponseError } from "@/utils/errors";

export class WebhookController {
    private webhookService: WebhookService;

    constructor() {
        this.webhookService = new WebhookService();
    }
    
    public async billing_update(req: Request, res: Response) {
        try {
            // Recibir estructura compleja: factura, references (items), entity_reference
            const { factura, references, entity_reference } = req.body;

            // 2. Validar Estructura Básica
            if (!factura || !references || !entity_reference) {
                 throw new ResponseError(400, "Payload inválido: faltan campos requeridos (factura, references, entity_reference)");
            }

            // 3. Delegar al servicio
            const result = await this.webhookService.process_billing_update({
                factura,
                references,
                entity_reference
            });

            // 4. Responder
            res.status(200).json({
                ok: true,
                ...result
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
