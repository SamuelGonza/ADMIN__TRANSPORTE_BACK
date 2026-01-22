import { ObjectId } from 'mongoose';
import { MediaTypes } from '../globals';
import { Document } from 'mongoose';


export type PreOpReport = {
    media: MediaTypes[]
    description: string
    value: number;
    status: "ok" | "details" | "failures"
    uploaded: Date
}

export interface VehiclePreoperational extends Document {
    vehicle_id: ObjectId;
    created: Date;
    reports: PreOpReport[];
    estado: "no_liquidado" | "liquidado"; // Estado de liquidación
    uploaded_by: ObjectId;
}