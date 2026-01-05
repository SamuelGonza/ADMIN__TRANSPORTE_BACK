import { Document, ObjectId } from "mongoose";

export interface Location extends Document {
    company_id: ObjectId;
    name: string;             // texto original (para mostrar)
    normalized_name: string;  // para búsquedas y evitar duplicados
    created: Date;
    last_used?: Date;
    usage_count: number;
}










