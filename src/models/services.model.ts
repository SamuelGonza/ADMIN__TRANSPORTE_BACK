import { Services } from "@/contracts/interfaces/services.interface";
import { MongoIdRef } from "@/utils/constants";
import mongoose, { Schema } from "mongoose";

const ServicesSchema: Schema = new Schema<Services>({
    code: {type: String, required: true},
    name: {type: String, required: false},
    description: {type: String, required: true},
    value: {type: Number, required: true},
    company_id: {type: MongoIdRef, ref: "Companie", required: true}
})

export default mongoose.model<Services>("Service", ServicesSchema)