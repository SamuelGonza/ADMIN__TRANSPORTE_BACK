import { Document, ObjectId } from "mongoose";
import { MediaTypes } from "../globals";

export interface VehicleDocuments extends Document {
    vehicle_id: ObjectId;
    soat: MediaTypes;
    tecnomecanica: MediaTypes;
    seguro: MediaTypes;
    licencia_transito: MediaTypes;
    runt: MediaTypes;
}