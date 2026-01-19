import solicitudModel from "@/models/solicitud.model";
import companyModel from "@/models/company.model";
import facturaModel from "@/models/factura.model";
import { ResponseError } from "@/utils/errors";

export class WebhookService {
    
    public async process_billing_update({
        factura,
        references,
        entity_reference
    }: {
        factura: any;
        references: any[];
        entity_reference: string;
    }) {
        try {
            console.log(`📡 Webhook recibido: Factura ${factura.Encabezado?.PrefijoDocumento}-${factura.Encabezado?.NumeroDocumento}, Refs: ${references.length}`);

            // 1. Buscar Empresa por entity_reference (Ej: "9013441565-5")
            // Asumimos que la parte antes del guion es el documento
            const documentNumber = entity_reference.split('-')[0]; 
            
            // Intentar buscar por string o number, ya que document.number puede ser mixto en BD legado
            const company = await companyModel.findOne({
                $or: [
                    { "document.number": documentNumber },
                    { "document.number": Number(documentNumber) }
                ]
            });

            if (!company) {
                throw new ResponseError(404, `Empresa no encontrada para referencia: ${entity_reference} (Doc: ${documentNumber})`);
            }

            // 2. Guardar Factura en Modelo Propio
            const encabezado = factura.Encabezado || {};
            const totales = factura.Totales?.TotalMonetario || {};
            
            // Obtener impuestos con validación segura
            let totalImpuestos = 0;
            if (factura.Totales?.TotalImpuestos && factura.Totales.TotalImpuestos.length > 0) {
                totalImpuestos = Number(factura.Totales.TotalImpuestos[0].ValorImpuesto?.Value || 0);
            }

            const nuevaFactura = await facturaModel.create({
                company_id: company._id,
                prefijo: encabezado.PrefijoDocumento,
                numero: encabezado.NumeroDocumento,
                numero_completo: `${encabezado.PrefijoDocumento}-${encabezado.NumeroDocumento}`,
                fecha_emision: new Date(encabezado.FechaYHoraDocumento || new Date()),
                total_bruto: Number(totales.ValorBruto?.Value || 0),
                total_impuestos: totalImpuestos,
                total_pagar: Number(totales.ValorAPagar?.Value || 0),
                raw_data: factura,
                status: 'active'
            });

            const updatedSolicitudes: string[] = [];
            const errors: string[] = [];

            // 3. Procesar Referencias (Solicitudes)
            for (const ref of references) {
                const solicitudId = ref.external_identifier;
                
                try {
                    if (!solicitudId) continue;

                    const solicitud = await solicitudModel.findById(solicitudId);
                    if (!solicitud) {
                        errors.push(`Solicitud no encontrada: ${solicitudId}`);
                        continue;
                    }

                    // Actualizar estado a facturado
                    solicitud.accounting_status = "facturado";
                    solicitud.n_factura = nuevaFactura.numero_completo;
                    solicitud.fecha_factura = nuevaFactura.fecha_emision;
                    solicitud.factura_id = nuevaFactura._id as any; // Vincular con la factura creada
                    solicitud.fecha_final = new Date();
                    
                    // Guardar auditoría (webhook viene de sistema externo, no hay usuario)
                    // generated_factura_by se deja como null ya que viene de sistema externo
                    (solicitud as any).generated_factura_at = new Date();
                    
                    await solicitud.save();
                    updatedSolicitudes.push(solicitudId);

                } catch (err: any) {
                    console.error(`Error procesando solicitud ${solicitudId} en webhook:`, err);
                    errors.push(`Error al actualizar ${solicitudId}: ${err.message}`);
                }
            }

            return {
                message: "Webhook procesado y factura guardada",
                factura_id: nuevaFactura._id,
                processed_count: updatedSolicitudes.length,
                updated_ids: updatedSolicitudes,
                errors: errors.length > 0 ? errors : undefined
            };

        } catch (error) {
            if (error instanceof ResponseError) throw error;
            console.error("Error en servicio de webhook:", error);
            throw new ResponseError(500, "Error interno procesando webhook");
        }
    }
}
