import { Document, ObjectId } from "mongoose";
import { MediaTypes } from "../globals";

export interface DriverDocuments extends Document {
    driver_id: ObjectId;
    document: {
        back: MediaTypes,
        front: MediaTypes
    };
    licencia_conduccion: {
        back: MediaTypes,
        front: MediaTypes
    };
}