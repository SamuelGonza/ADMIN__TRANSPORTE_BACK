import { ObjectId } from 'mongoose';
import { MediaTypes } from '../globals';
import { Document } from 'mongoose';


export type PreOpReport = {
    media: MediaTypes[]
    description: string
    status: "ok" | "details" | "failures"
    uploaded: Date
}

export interface VehiclePreoperational extends Document {
    vehicle_id: ObjectId;
    created: Date;
    reports: PreOpReport[];
    uploaded_by: ObjectId;
}