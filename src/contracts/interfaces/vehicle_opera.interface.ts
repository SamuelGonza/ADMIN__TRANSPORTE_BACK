import { ObjectId } from "mongoose";
import { MediaTypes } from "../globals";
import { Document } from "mongoose";



export type VehicleBills = {
    type_bill: "fuel" | "tolls" | "repairs" | "fines" | "parking_lot";
    value: number;
    description: string;
    media_support: MediaTypes[]
    uploaded: Date
}

export interface VehicleOperational extends Document {
    vehicle_id: ObjectId;
    bills: VehicleBills[];
    created: Date;
    uploaded_by: ObjectId
}