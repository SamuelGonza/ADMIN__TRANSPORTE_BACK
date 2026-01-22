import { PreOpReport, VehiclePreoperational } from "@/contracts/interfaces/vehicle_preop.interface";
import mongoose, { Schema } from "mongoose";
import { MediaTypesSchema } from "./vhc_operational.model";
import { MongoIdRef } from "@/utils/constants";

const VehicleReports: Schema = new Schema<PreOpReport>({
    media: {type: [MediaTypesSchema], required: false},
    description: {type: String, required: true},
    value: {type: Number, required: false},
    status: {type: String, enum: ["ok", "details", "failures"]},
    uploaded: {type: Date, default: new Date()},
})

const VehiclePreoperationalSchema: Schema = new Schema<VehiclePreoperational>({
    vehicle_id: {type: MongoIdRef, ref: "Vehicle", required: true},
    reports: {type: [VehicleReports], required: false},
    estado: {type: String, enum: ["no_liquidado", "liquidado"], required: true, default: "no_liquidado"},
    created: {type: Date, default: new Date()},
    uploaded_by: {type: MongoIdRef, ref: "User", required: true}
})

// Índices
VehiclePreoperationalSchema.index({ vehicle_id: 1, created: -1 });
VehiclePreoperationalSchema.index({ estado: 1 });

export default mongoose.model<VehiclePreoperational>("VehiclePreoperational", VehiclePreoperationalSchema)