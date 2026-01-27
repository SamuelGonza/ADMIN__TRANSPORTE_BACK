import { Document, ObjectId } from "mongoose";

export interface ClientUser extends Document {
    full_name: string;
    email: string;
    password: string;
    company_id: ObjectId;
    cliente_id: ObjectId;
    created: Date;
}
