import { Document } from "mongoose";
import {ObjectId} from "mongoose";
import { MediaTypes } from "../globals";

export type VehicleTypes = "bus" | "buseta" | "buseton" | "camioneta" | "campero" | "micro" | "van"
export type VehicleFlota = "externo" | "propio" | "afiliado"

export interface Vehicle extends Document {
    driver_id: ObjectId;
    possible_drivers?: ObjectId[];
    n_numero_interno?: string;
    placa: string;
    name?: string;
    description?: string
    seats: number;
    flota: VehicleFlota;
    created: Date;
    type: VehicleTypes;
    picture: MediaTypes;
    technical_sheet?: {
        licencia_transito_numero?: string;
        linea?: string;
        cilindrada_cc?: number;
        servicio?: string;
        carroceria?: string;
        capacidad_pasajeros?: number;
        capacidad_toneladas?: number;
        numero_chasis?: string;
        fecha_matricula?: Date;
        tarjeta_operacion_numero?: string;
        tarjeta_operacion_vencimiento?: Date;
        titular_licencia?: string;

        marca?: string;
        modelo?: number;
        color?: string;
        tipo_combustible?: string;
        numero_motor?: string;
        numero_serie?: string;
        declaracion_importacion?: string;
    };
    owner_id: {
        type: "Company" | "User",
        company_id: ObjectId;
        user_id: ObjectId;
    }
}