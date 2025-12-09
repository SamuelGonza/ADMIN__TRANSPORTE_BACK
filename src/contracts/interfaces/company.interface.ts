import { Document } from "mongoose";
import { MediaTypes } from "../globals";
import { UserDocuments } from "./user.interface";

export interface Companies extends Document {
    company_name: string;
    document: {
        type: UserDocuments;
        number: number;
        dv: string;
    };
    simba_token?: string;
    fe_id_ref?: string;
    logo: MediaTypes;
    created: Date;
}