import { DriverPayments } from "@/contracts/interfaces/driver_payments.interface";
import { MongoIdRef } from "@/utils/constants";
import mongoose, { Schema } from "mongoose";

const DriverPaymentHistorySchema: Schema = new Schema(
    {
        tipo: { type: String, enum: ["incremento", "decremento"], required: true },
        valor: { type: Number, required: true },
        motivo: { type: String, required: true },
        solicitud_id: { type: MongoIdRef, ref: "Solicitud", required: false },
        cuenta_cobro_id: { type: MongoIdRef, ref: "PaymentSection", required: false },
        created: { type: Date, default: new Date() },
        created_by: { type: MongoIdRef, ref: "User", required: false }
    },
    { _id: false }
);

const DriverPaymentsSchema: Schema = new Schema<DriverPayments>({
    driver_id: { type: MongoIdRef, ref: "User", required: true },
    company_id: { type: MongoIdRef, ref: "Companie", required: true },
    
    valor_actual: { type: Number, required: true, default: 0 },
    
    historial: { type: [DriverPaymentHistorySchema], required: false, default: [] },
    
    created: { type: Date, default: new Date() },
    updated: { type: Date, default: new Date() }
});

// Índices
DriverPaymentsSchema.index({ driver_id: 1, company_id: 1 }, { unique: true });
DriverPaymentsSchema.index({ company_id: 1 });

export default mongoose.model<DriverPayments>("DriverPayments", DriverPaymentsSchema);


