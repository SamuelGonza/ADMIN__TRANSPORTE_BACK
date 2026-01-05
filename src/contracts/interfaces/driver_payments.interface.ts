import { Document, ObjectId } from "mongoose";

/**
 * Historial de movimientos de valores de un conductor
 */
export interface DriverPaymentHistory {
    tipo: "incremento" | "decremento";
    valor: number; // Valor del movimiento (positivo para incremento, negativo para decremento)
    motivo: string; // Razón del movimiento
    solicitud_id?: ObjectId; // Solicitud relacionada (si aplica)
    cuenta_cobro_id?: ObjectId; // Cuenta de cobro relacionada (si aplica)
    created: Date;
    created_by?: ObjectId; // Usuario que realizó el movimiento
}

/**
 * Valores acumulados de un conductor (solo para afiliados y externos)
 */
export interface DriverPayments extends Document {
    driver_id: ObjectId; // Referencia al conductor (User)
    company_id: ObjectId;
    
    // Valor actual acumulado
    valor_actual: number; // Valor total acumulado (se incrementa/decrementa)
    
    // Historial de movimientos
    historial: DriverPaymentHistory[];
    
    // Metadata
    created: Date;
    updated: Date;
}


