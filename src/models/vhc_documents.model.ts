import { VehicleDocuments } from "@/contracts/interfaces/vehicle_documents.interface"
import { mixed, MongoIdRef } from "@/utils/constants"
import mongoose, { Schema } from "mongoose"

const VehicleDocumentsSchema: Schema = new Schema<VehicleDocuments>({
    vehicle_id: {type: MongoIdRef, ref: "Vehicle", required: true},
    soat: {type: mixed, required: true},
    tecnomecanica: {type: mixed, required: true},
    seguro: {type: mixed, required: true},
    licencia_transito: {type: mixed, required: true},
    runt: {type: mixed, required: true},
})

export default mongoose.model<VehicleDocuments>("VehicleDocument", VehicleDocumentsSchema)