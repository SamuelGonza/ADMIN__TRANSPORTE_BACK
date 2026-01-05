import { Document, ObjectId } from "mongoose";

/**
 * Cuenta de cobro individual por propietario de vehículo
 */
export interface CuentaCobro {
    vehiculo_id: ObjectId;
    placa: string;
    propietario: {
        type: "Company" | "User";
        company_id?: ObjectId;
        user_id?: ObjectId;
        nombre: string; // Nombre del propietario (company_name o full_name)
    };
    conductor_id?: ObjectId; // Conductor asignado al vehículo en este servicio
    flota: "externo" | "propio" | "afiliado";
    
    // Valores financieros
    valor_base: number; // Valor a pagar antes de descuentos
    gastos_operacionales: number; // Suma de gastos operacionales del vehículo
    gastos_preoperacionales: number; // Suma de gastos preoperacionales (si aplica)
    valor_final: number; // valor_base - gastos_operacionales - gastos_preoperacionales
    
    // Estado de la cuenta de cobro
    estado: "pendiente" | "calculada" | "pagada" | "cancelada";
    
    // Documentos de soporte
    doc_soporte?: string;
    fecha_pago?: Date;
    n_egreso?: string;
    
    created: Date;
    updated: Date;
}

/**
 * Sección de Pagos - Agrupa todas las cuentas de cobro de una solicitud
 */
export interface PaymentSection extends Document {
    solicitud_id: ObjectId; // Referencia a la solicitud
    company_id: ObjectId;
    
    // Agrupación de cuentas de cobro
    cuentas_cobro: CuentaCobro[];
    
    // Totales consolidados
    total_valor_base: number;
    total_gastos_operacionales: number;
    total_gastos_preoperacionales: number;
    total_valor_final: number;
    
    // Estado general
    estado: "pendiente" | "calculada" | "parcialmente_pagada" | "pagada" | "cancelada";
    
    // Metadata
    created: Date;
    created_by?: ObjectId; // Usuario que creó la sección (coordinador/comercial)
    updated: Date;
    updated_by?: ObjectId;
}


