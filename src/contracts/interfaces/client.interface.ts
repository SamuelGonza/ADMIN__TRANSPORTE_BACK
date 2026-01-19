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

    // Documento de identificación
    documento_tipo?: "NIT" | "CC" | "CE" | "PASAPORTE" | "OTRO"; // Tipo de documento
    documento_numero?: string; // Número del documento

    created: Date;
}