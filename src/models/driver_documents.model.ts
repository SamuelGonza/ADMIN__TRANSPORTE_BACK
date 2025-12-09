import { DriverDocuments } from "@/contracts/interfaces/driver_documents.interface";
import { MongoIdRef } from "@/utils/constants";
import mongoose, { Schema } from "mongoose";
import { MediaTypesSchema } from "./vhc_operational.model";

const DriverDocumentsSchema: Schema = new Schema<DriverDocuments>({
    driver_id: {type: MongoIdRef, ref: "User", required: true},
    document: {
        back: {type: MediaTypesSchema, required: false},
        front: {type: MediaTypesSchema, required: false}
    },
    licencia_conduccion: {
        back: {type: MediaTypesSchema, required: false},
        front: {type: MediaTypesSchema, required: false}
    },
})

export default mongoose.model<DriverDocuments>("driver_document", DriverDocumentsSchema)