import { Factura } from "@/contracts/interfaces/factura.interface";
import { MongoIdRef, mixed } from "@/utils/constants";
import mongoose, { Schema } from "mongoose";

const FacturaSchema: Schema = new Schema<Factura>({
    company_id: { type: MongoIdRef, ref: "Companie", required: true },
    
    prefijo: { type: String, required: true },
    numero: { type: String, required: true },
    numero_completo: { type: String, required: true }, // Indexado
    fecha_emision: { type: Date, required: true },
    
    total_bruto: { type: Number, required: true },
    total_impuestos: { type: Number, required: true },
    total_pagar: { type: Number, required: true },
    
    raw_data: { type: mixed, required: true },
    
    created: { type: Date, default: new Date() },
    status: { type: String, enum: ["active", "annulled"], default: "active" }
});

FacturaSchema.index({ company_id: 1 });
FacturaSchema.index({ numero_completo: 1 });
FacturaSchema.index({ fecha_emision: -1 });

export default mongoose.model<Factura>("Factura", FacturaSchema);
