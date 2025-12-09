import { Document } from "mongoose";
import {ObjectId} from "mongoose";
import { MediaTypes } from "../globals";

export type VehicleTypes = "bus" | "buseta" | "buseton" | "camioneta" | "campero" | "micro" | "van"
export type VehicleFlota = "externo" | "propio" | "afiliado"

export interface Vehicle extends Document {
    driver_id: ObjectId;
    placa: string;
    name?: string;
    description?: string
    seats: number;
    flota: VehicleFlota;
    created: Date;
    type: VehicleTypes;
    picture: MediaTypes;
    owner_id: {
        type: "Company" | "User" | "Both",
        company_id: ObjectId;
        user_id: ObjectId;
    }
}