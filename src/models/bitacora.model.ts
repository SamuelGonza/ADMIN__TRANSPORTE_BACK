import { Bitacora } from "@/contracts/interfaces/bitacora.interface";
import { MongoIdRef } from "@/utils/constants";
import mongoose, { Schema } from "mongoose";

const BitacoraSchema: Schema = new Schema<Bitacora>({
    company_id: {type: MongoIdRef, ref: "Companie", required: true},
    year: {type: String, required: true},
    month: {type: String, required: true},
    created: {type: Date, required: true},
})

// Índice único para evitar bitácoras duplicadas por compañía, año y mes
BitacoraSchema.index({ company_id: 1, year: 1, month: 1 }, { unique: true });

export default mongoose.model<Bitacora>("Bitacora", BitacoraSchema)