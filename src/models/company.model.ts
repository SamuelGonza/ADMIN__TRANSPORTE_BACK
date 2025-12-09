import { Companies } from "@/contracts/interfaces/company.interface";
import { mixed } from "@/utils/constants";
import mongoose, { Schema } from "mongoose";

const CompanySchema: Schema = new Schema<Companies>({
    company_name: {type: String, required: true},
    document: {type: mixed, required: true},
    logo: {type: mixed, required: true},
    simba_token: {type: String, required: false},
    fe_id_ref: {type: String, required: false},
    created: {type: Date, default: new Date()}
})

export default mongoose.model<Companies>("Companie", CompanySchema)