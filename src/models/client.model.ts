import { MongoIdRef } from "@/utils/constants";
import { Client, ClientContact } from "../contracts/interfaces/client.interface";
import mongoose, { Schema } from "mongoose";

const ClientContactSchema: Schema = new Schema<ClientContact>({
    name: { type: String, required: true },
    phone: { type: String, required: true }
}, { _id: false });

const ClientSchema: Schema = new Schema<Client>({
    company_id: { type: MongoIdRef, ref: "Companie" },
    name: { type: String, required: true },
    phone: { type: String, required: false }, // Mantener para retrocompatibilidad
    contacts: { type: [ClientContactSchema], required: true, default: [] }, // Múltiples contactos
    email: { type: String, required: true },
    password: { type: String, required: true },
    // Documento de identificación
    documento_tipo: { type: String, required: false, enum: ["NIT", "CC", "CE", "PASAPORTE", "OTRO"] },
    documento_numero: { type: String, required: false },
    created: { type: Date, default: new Date() },
})

export default mongoose.model<Client>("Client", ClientSchema);