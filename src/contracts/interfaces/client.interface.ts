import { Document, ObjectId } from "mongoose";

export interface ClientContact {
    name: string;
    phone: string;
}

export interface Client extends Document {
    company_id: ObjectId;
    name: string;

    phone: string; // Teléfono principal (mantener para retrocompatibilidad)
    contacts: ClientContact[]; // Múltiples contactos

    email: string;
    password: string;

    created: Date;
}