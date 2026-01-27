import { MongoIdRef } from "@/utils/constants";
import { ClientUser } from "../contracts/interfaces/client_user.interface";
import mongoose, { Schema } from "mongoose";

const ClientUserSchema: Schema = new Schema<ClientUser>({
    full_name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    company_id: { type: MongoIdRef, ref: "Companie", required: true },
    cliente_id: { type: MongoIdRef, ref: "Client", required: true },
    created: { type: Date, default: new Date() },
});

export default mongoose.model<ClientUser>("ClientUser", ClientUserSchema);
