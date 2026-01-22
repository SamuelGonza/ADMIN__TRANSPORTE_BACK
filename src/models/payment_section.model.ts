import { PaymentSection } from "@/contracts/interfaces/payment_section.interface";
import { MongoIdRef } from "@/utils/constants";
import mongoose, { Schema } from "mongoose";

const PagoVehiculoSchema: Schema = new Schema(
    {
        tipo_contrato: { type: String, enum: ["fijo", "ocasional"], required: true },
        pricing_mode: { type: String, enum: ["por_hora", "por_kilometro", "por_distancia", "por_viaje", "por_trayecto"], required: true },
        tarifa: { type: Number, required: true },
        cantidad: { type: Number, required: false },
        valor_calculado: { type: Number, required: false },
        usar_valor_manual: { type: Boolean, required: false, default: false }
    },
    { _id: false }
);

const CuentaCobroSchema: Schema = new Schema(
    {
        vehiculo_id: { type: MongoIdRef, ref: "Vehicle", required: true },
        placa: { type: String, required: true },
        propietario: {
            type: { type: String, enum: ["Company", "User"], required: true },
            company_id: { type: MongoIdRef, ref: "Companie", required: false },
            user_id: { type: MongoIdRef, ref: "User", required: false },
            nombre: { type: String, required: true }
        },
        conductor_id: { type: MongoIdRef, ref: "User", required: false },
        flota: { type: String, enum: ["externo", "propio", "afiliado"], required: true },
        
        // Configuración del contrato de compra
        pago_vehiculo: { type: PagoVehiculoSchema, required: false },
        
        // Valores financieros
        valor_base: { type: Number, required: true, default: 0 },
        gastos_operacionales: { type: Number, required: true, default: 0 },
        gastos_preoperacionales: { type: Number, required: true, default: 0 },
        valor_final: { type: Number, required: true, default: 0 },
        
        // Estado
        estado: { type: String, enum: ["pendiente", "calculada", "pagada", "cancelada"], default: "pendiente" },
        
        // Documentos
        doc_soporte: { type: String, required: false },
        fecha_pago: { type: Date, required: false },
        n_egreso: { type: String, required: false },
        
        created: { type: Date, default: new Date() },
        updated: { type: Date, default: new Date() }
    },
    { _id: false }
);

const PaymentSectionSchema: Schema = new Schema<PaymentSection>({
    solicitud_id: { type: MongoIdRef, ref: "Solicitud", required: true },
    company_id: { type: MongoIdRef, ref: "Companie", required: true },
    
    cuentas_cobro: { type: [CuentaCobroSchema], required: true, default: [] },
    
    // Totales consolidados
    total_valor_base: { type: Number, required: true, default: 0 },
    total_gastos_operacionales: { type: Number, required: true, default: 0 },
    total_gastos_preoperacionales: { type: Number, required: true, default: 0 },
    total_valor_final: { type: Number, required: true, default: 0 },
    
    // Estado general
    estado: { type: String, enum: ["pendiente", "calculada", "parcialmente_pagada", "pagada", "cancelada"], default: "pendiente" },
    
    // Metadata
    created: { type: Date, default: new Date() },
    created_by: { type: MongoIdRef, ref: "User", required: false },
    updated: { type: Date, default: new Date() },
    updated_by: { type: MongoIdRef, ref: "User", required: false }
});

// Índices
PaymentSectionSchema.index({ solicitud_id: 1 });
PaymentSectionSchema.index({ company_id: 1, created: -1 });

export default mongoose.model<PaymentSection>("PaymentSection", PaymentSectionSchema);


