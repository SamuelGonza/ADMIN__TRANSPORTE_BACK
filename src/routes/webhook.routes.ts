import { Router } from "express";
import { WebhookController } from "@/controllers/webhook.controller";

const router: Router = Router();
const webhookController = new WebhookController();

/**
 * @openapi
 * /webhooks/billing-update:
 *   post:
 *     tags: [Webhooks]
 *     summary: Recibir actualización de facturación (Internal System)
 *     description: Actualiza el estado de las solicitudes a "facturado". Requiere header `x-webhook-secret`.
 *     parameters:
 *       - in: header
 *         name: x-webhook-secret
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               event: { type: string }
 *               invoice_data: 
 *                 type: object
 *                 properties:
 *                   number: { type: string }
 *                   date: { type: string }
 *               items: 
 *                 type: array
 *                 items: 
 *                   type: object
 *                   properties:
 *                     reference_id: { type: string }
 *                     amount: { type: number }
 *     responses:
 *       200:
 *         description: Procesado correctamente
 */
router.post("/billing-update", webhookController.billing_update.bind(webhookController));

export default router;
