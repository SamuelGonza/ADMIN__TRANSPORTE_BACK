import { Document, ObjectId } from "mongoose";

//! DEFINIR EL RESTO DE LA INFORMACION, esto es una opcion basica mientras se define
export interface Services extends Document {
    code: string;
    name: string;
    description: string;
    value: number;
    company_id: ObjectId
}