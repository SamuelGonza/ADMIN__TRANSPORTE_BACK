import { Document, ObjectId } from "mongoose";

export interface Preliquidacion extends Document {
    company_id: ObjectId;
    
    // Identificadores
    numero: string; // Número de preliquidación generado automáticamente
    fecha: Date;
    
    // Solicitudes y gastos incluidos
    solicitudes_ids: ObjectId[]; // Array de IDs de solicitudes
    gastos_operacionales_ids: ObjectId[]; // Array de IDs de gastos operacionales
    gastos_preoperacionales_ids: ObjectId[]; // Array de IDs de gastos preoperacionales
    
    // Valores monetarios
    total_solicitudes: number; // Suma de total_a_pagar de todas las solicitudes
    total_gastos_operacionales: number; // Suma de todos los gastos Op seleccionados
    total_gastos_preoperacionales: number; // Suma de todos los gastos PreOp seleccionados
    total_preliquidacion: number; // total_solicitudes - (total_gastos_operacionales + total_gastos_preoperacionales)
    
    // Aprobación/Rechazo (rol contabilidad)
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
    created_by: ObjectId; // Usuario que creó la preliquidación
    last_modified_by?: ObjectId;
}
