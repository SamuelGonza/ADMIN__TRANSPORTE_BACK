import { Document, ObjectId } from "mongoose";

export interface Client extends Document {
    company_id: ObjectId;
    name: string;

    phone: string;
    contact_name: string;
    contact_phone: string;

    email: string;
    password: string;

    created: Date;
}