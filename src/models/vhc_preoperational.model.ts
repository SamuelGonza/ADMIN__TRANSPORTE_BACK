import { PreOpReport, VehiclePreoperational } from "@/contracts/interfaces/vehicle_preop.interface";
import mongoose, { Schema } from "mongoose";
import { MediaTypesSchema } from "./vhc_operational.model";
import { MongoIdRef } from "@/utils/constants";

const VehicleReports: Schema = new Schema<PreOpReport>({
    media: {type: [MediaTypesSchema], required: false},
    description: {type: String, required: false},
    status: {type: String, enum: ["ok", "details", "failures"]},
    uploaded: {type: Date, default: new Date()},
})

const VehiclePreoperationalSchema: Schema = new Schema<VehiclePreoperational>({
    vehicle_id: {type: MongoIdRef, ref: "Vehicle", required: true},
    reports: {type: [VehicleReports], required: false},
    created: {type: Date, default: new Date()},
    uploaded_by: {type: MongoIdRef, ref: "User", required: true}
})

export default mongoose.model<VehiclePreoperational>("VehiclePreoperational", VehiclePreoperationalSchema)