import { Vehicle } from "@/contracts/interfaces/vehicles.interface";
import { mixed, MongoIdRef } from "@/utils/constants";
import mongoose, { Schema } from "mongoose";

const VehicleSchema: Schema = new Schema<Vehicle>({
    driver_id: {type: MongoIdRef, ref: "User", required: true },
    placa: {type: String, required: true},
    name: {type: String, required: false},
    description: {type: String, required: false},
    seats: {type: Number, required: true},
    type: {type: String, enum: ["bus", "buseta", "buseton", "camioneta", "campero", "micro", "van"]},
    flota: {type: String, enum: ["externo", "propio", "afiliado"]},
    picture: {type: mixed, required: true},
    owner_id: {
        type: {type: String, enum: ["Company", "User", "Both"]},
        company_id: {type: MongoIdRef, ref: "Companie"},
        user_id: {type: MongoIdRef, ref: "User"}
    },
    created: {type: Date, default: new Date()}
})

export default mongoose.model<Vehicle>("Vehicle", VehicleSchema)