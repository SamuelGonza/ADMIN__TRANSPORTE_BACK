import { Document, ObjectId } from "mongoose";

/**
 * Liquidación por vehículo individual
 */
export interface LiquidacionVehiculo {
    vehiculo_id: ObjectId;
    placa: string;
    flota: "propio" | "afiliado" | "externo";
    propietario: {
        type: "Company" | "User";
        company_id?: ObjectId;
        user_id?: ObjectId;
        nombre: string;
    };
    
    // Servicios asociados a este vehículo
    solicitudes_ids: ObjectId[]; // IDs de solicitudes donde participa este vehículo
    
    // Gastos operacionales del vehículo
    gastos_operacionales_ids: ObjectId[];
    
    // Valores calculados
    total_servicios: number; // Suma de servicios donde participa el vehículo
    total_gastos_operacionales: number; // Suma de gastos operacionales
    total_liquidacion: number; // total_servicios - total_gastos_operacionales
    
    // Estado de liquidación
    estado: "pendiente" | "liquidado_sin_pagar" | "pagado";
    
    // Referencia a cuenta de cobro (solo si el vehículo NO es propio)
    cuenta_cobro_id?: ObjectId;
}

export interface Preliquidacion extends Document {
    company_id: ObjectId;
    
    // Identificadores
    numero: string; // Número de preliquidación generado automáticamente
    fecha: Date;
    
    // Solicitudes y gastos incluidos
    solicitudes_ids: ObjectId[]; // Array de IDs de solicitudes
    gastos_operacionales_ids: ObjectId[]; // Array de IDs de gastos operacionales
    gastos_preoperacionales_ids: ObjectId[]; // Array de IDs de gastos preoperacionales
    
    // Liquidaciones por vehículo
    liquidaciones_vehiculos: LiquidacionVehiculo[];
    
    // Valores monetarios (totales consolidados)
    total_solicitudes: number; // Suma de total_a_pagar de todas las solicitudes
    total_gastos_operacionales: number; // Suma de todos los gastos Op seleccionados
    total_gastos_preoperacionales: number; // Suma de todos los gastos PreOp seleccionados
    total_preliquidacion: number; // total_solicitudes - (total_gastos_operacionales + total_gastos_preoperacionales)
    
    // Aprobación/Rechazo (rol ADMIN)
    estado: "pendiente" | "aprobada" | "rechazada";
    aprobada_por?: ObjectId;
    aprobada_fecha?: Date;
    rechazada_por?: ObjectId;
    rechazada_fecha?: Date;
    notas?: string;
    
    // Envío al cliente
    enviada_al_cliente: boolean;
    fecha_envio_cliente?: Date;
    enviada_por?: ObjectId;
    historial_envios?: Array<{
        fecha: Date;
        estado: "aprobada" | "rechazada";
        enviado_por: ObjectId;
        notas?: string;
    }>;
    
    // Metadata
    created: Date;
    created_by: ObjectId; // Usuario que creó la preliquidación (contabilidad)
    last_modified_by?: ObjectId;
}
