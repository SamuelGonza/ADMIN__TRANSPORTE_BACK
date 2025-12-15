import mongoose, { Schema } from "mongoose";
import { User } from "@/contracts/interfaces/user.interface";
import { mixed, MongoIdRef } from '@/utils/constants';

const UserSchema: Schema = new Schema<User>({
    full_name: {type: String, required: true},
    document: {type: mixed, required: true},
    avatar: {type: mixed, required: true},
    role: {type: String, enum: ["superadmon", "admin", "coordinador", "comercia", "contabilidad", "operador", "conductor", "cliente"]},
    contact: {type: mixed, required: false},
    email: {type: String, required: true, unique: true},
    password: {type: String, required: true},
    company_id: {type: MongoIdRef, ref: "Companie"},
    otp_recovery: {type: Number, require: true},
    created: {type: Date, default: new Date()},
    is_active: {type: Boolean, default: false},
    is_delete: {type: Boolean, default: false}
})

export default mongoose.model<User>("User", UserSchema)