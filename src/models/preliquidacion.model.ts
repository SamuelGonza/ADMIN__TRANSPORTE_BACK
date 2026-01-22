import { Preliquidacion } from "@/contracts/interfaces/preliquidacion.interface";
import { MongoIdRef } from "@/utils/constants";
import mongoose, { Schema } from "mongoose";

const HistorialEnvioSchema: Schema = new Schema(
    {
        fecha: { type: Date, required: true },
        estado: { type: String, required: true, enum: ["aprobada", "rechazada"] },
        enviado_por: { type: MongoIdRef, ref: "User", required: true },
        notas: { type: String, required: false }
    },
    { _id: false }
);

const PreliquidacionSchema: Schema = new Schema<Preliquidacion>({
    company_id: { type: MongoIdRef, ref: "Companie", required: true },
    
    // Identificadores
    numero: { type: String, required: true, unique: true },
    fecha: { type: Date, required: true, default: new Date() },
    
    // Solicitudes y gastos incluidos
    solicitudes_ids: { type: [MongoIdRef], ref: "Solicitud", required: true },
    gastos_operacionales_ids: { type: [MongoIdRef], ref: "VehicleOperational", required: true, default: [] },
    gastos_preoperacionales_ids: { type: [MongoIdRef], ref: "VehiclePreoperational", required: true, default: [] },
    
    // Valores monetarios
    total_solicitudes: { type: Number, required: true, default: 0 },
    total_gastos_operacionales: { type: Number, required: true, default: 0 },
    total_gastos_preoperacionales: { type: Number, required: true, default: 0 },
    total_preliquidacion: { type: Number, required: true, default: 0 },
    
    // Aprobación/Rechazo
    estado: { 
        type: String, 
        required: true, 
        enum: ["pendiente", "aprobada", "rechazada"], 
        default: "pendiente" 
    },
    aprobada_por: { type: MongoIdRef, ref: "User", required: false },
    aprobada_fecha: { type: Date, required: false },
    rechazada_por: { type: MongoIdRef, ref: "User", required: false },
    rechazada_fecha: { type: Date, required: false },
    notas: { type: String, required: false },
    
    // Envío al cliente
    enviada_al_cliente: { type: Boolean, required: false, default: false },
    fecha_envio_cliente: { type: Date, required: false },
    enviada_por: { type: MongoIdRef, ref: "User", required: false },
    historial_envios: { type: [HistorialEnvioSchema], required: false, default: [] },
    
    // Metadata
    created: { type: Date, default: new Date() },
    created_by: { type: MongoIdRef, ref: "User", required: true },
    last_modified_by: { type: MongoIdRef, ref: "User", required: false }
});

// Índices
PreliquidacionSchema.index({ company_id: 1 });
PreliquidacionSchema.index({ numero: 1 });
PreliquidacionSchema.index({ estado: 1 });
PreliquidacionSchema.index({ fecha: -1 });
PreliquidacionSchema.index({ solicitudes_ids: 1 });

export default mongoose.model<Preliquidacion>("Preliquidacion", PreliquidacionSchema);
