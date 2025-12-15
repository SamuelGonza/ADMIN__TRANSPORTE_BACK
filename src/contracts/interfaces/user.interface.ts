import { Document, ObjectId } from "mongoose";
import { MediaTypes } from "../globals";

export type UserDocuments = "cc" | "ce" | "psp" | "ti" | "nit";
export type UserRoles = "superadmon" | "admin" | "coordinador" | "comercia" | "contabilidad" | "operador" | "conductor" | "cliente"

export interface User extends Document {
    full_name: string;
    document: {
        type: UserDocuments;
        number: number
    };
    avatar: MediaTypes;
    role: UserRoles

    contact: {
        email: string;
        phone: string;
        address: string;
    }

    email: string;
    password: string;

    company_id: ObjectId
    otp_recovery: number;
    created: Date;
    is_active: boolean;
    is_delete: boolean;
}