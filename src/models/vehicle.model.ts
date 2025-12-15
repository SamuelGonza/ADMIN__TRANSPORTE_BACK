import { Vehicle } from "@/contracts/interfaces/vehicles.interface";
import { mixed, MongoIdRef } from "@/utils/constants";
import mongoose, { Schema } from "mongoose";

const VehicleSchema: Schema = new Schema<Vehicle>({
    driver_id: {type: MongoIdRef, ref: "User", required: true },
    possible_drivers: { type: [MongoIdRef], ref: "User", required: false, default: [] },
    n_numero_interno: { type: String, required: false },
    placa: {type: String, required: true},
    name: {type: String, required: false},
    description: {type: String, required: false},
    seats: {type: Number, required: true},
    type: {type: String, enum: ["bus", "buseta", "buseton", "camioneta", "campero", "micro", "van"]},
    flota: {type: String, enum: ["externo", "propio", "afiliado"]},
    picture: {type: mixed, required: true},
    technical_sheet: {
        licencia_transito_numero: { type: String, required: false },
        linea: { type: String, required: false },
        cilindrada_cc: { type: Number, required: false },
        servicio: { type: String, required: false },
        carroceria: { type: String, required: false },
        capacidad_pasajeros: { type: Number, required: false },
        capacidad_toneladas: { type: Number, required: false },
        numero_chasis: { type: String, required: false },
        fecha_matricula: { type: Date, required: false },
        tarjeta_operacion_numero: { type: String, required: false },
        tarjeta_operacion_vencimiento: { type: Date, required: false },
        titular_licencia: { type: String, required: false },

        marca: { type: String, required: false },
        modelo: { type: Number, required: false },
        color: { type: String, required: false },
        tipo_combustible: { type: String, required: false },
        numero_motor: { type: String, required: false },
        numero_serie: { type: String, required: false },
        declaracion_importacion: { type: String, required: false },
    },
    owner_id: {
        type: {type: String, enum: ["Company", "User"]},
        company_id: {type: MongoIdRef, ref: "Companie"},
        user_id: {type: MongoIdRef, ref: "User"}
    },
    created: {type: Date, default: new Date()}
})

export default mongoose.model<Vehicle>("Vehicle", VehicleSchema)