import { Document, ObjectId } from "mongoose";

export interface Factura extends Document {
    company_id: ObjectId;
    
    // Identificadores clave extraídos del JSON para búsquedas rápidas
    prefijo: string;
    numero: string; // Número consecutivo
    numero_completo: string; // PREFIJO-NUMERO
    fecha_emision: Date;
    
    // Valores monetarios clave
    total_bruto: number;
    total_impuestos: number;
    total_pagar: number;
    
    // El JSON completo recibido
    raw_data: any; // Guardaremos todo el objeto 'factura' aquí
    
    // Metadata interna
    created: Date;
    status: "active" | "annulled"; // Por si se anula en el futuro
}
