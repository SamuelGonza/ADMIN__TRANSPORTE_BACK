import { MongoIdRef } from "@/utils/constants";
import { Client } from "../contracts/interfaces/client.interface";
import mongoose, { Schema } from "mongoose";

const ClientSchema: Schema = new Schema<Client>({
    company_id: { type: MongoIdRef, ref: "Companie" },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    contact_name: { type: String, required: true },
    contact_phone: { type: String, required: true },
    email: { type: String, required: true },
    password: { type: String, required: true },
    created: { type: Date, default: new Date() },
})

export default mongoose.model<Client>("Client", ClientSchema);