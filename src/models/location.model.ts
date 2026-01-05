import { Location } from "@/contracts/interfaces/location.interface";
import { MongoIdRef } from "@/utils/constants";
import mongoose, { Schema } from "mongoose";

const LocationSchema: Schema = new Schema<Location>({
    company_id: { type: MongoIdRef, ref: "Companie", required: true },
    name: { type: String, required: true },
    normalized_name: { type: String, required: true },
    created: { type: Date, default: new Date() },
    last_used: { type: Date, required: false },
    usage_count: { type: Number, default: 0 }
});

LocationSchema.index({ company_id: 1, normalized_name: 1 }, { unique: true });
LocationSchema.index({ company_id: 1, name: 1 });

export default mongoose.model<Location>("Location", LocationSchema);










