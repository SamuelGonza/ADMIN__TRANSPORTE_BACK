import { MediaTypes } from "@/contracts/globals"
import { VehicleBills, VehicleOperational } from "@/contracts/interfaces/vehicle_opera.interface"
import { MongoIdRef } from "@/utils/constants"
import mongoose, { Schema } from "mongoose"


export const MediaTypesSchema: Schema = new Schema<MediaTypes>({
    url: {type: String, required: true},
    public_id: {type: String, required: true},
    type: {type: String, required: true},
    original_name: {type: String, required: false},
    file_extension: {type: String, required: false}
}, {_id: false})

const VehicleBillsSchema: Schema = new Schema<VehicleBills>({
    type_bill: {type: String, enum: ["fuel", "tolls", "repairs", "fines", "parking_lot"], required: true},
    value: {type: Number, required: true},
    description: {type: String, required: false},
    media_support: {type: [MediaTypesSchema], required: false},
    uploaded: {type: Date, default: new Date()}
})

const VehicleOperationalSchema: Schema = new Schema<VehicleOperational>({
    vehicle_id: {type: MongoIdRef, ref: "Vehicle", required: true},
    bills: {type: [VehicleBillsSchema], required: false},
    created: {type: Date, default: new Date()},
    uploaded_by: {type: MongoIdRef, ref: "User", required: true}
})

export default mongoose.model<VehicleOperational>("VehicleOperational", VehicleOperationalSchema)