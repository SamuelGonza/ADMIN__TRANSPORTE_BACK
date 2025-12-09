import { GLOBAL_ENV } from "@/utils/constants";
import { ResponseError } from "@/utils/errors";
import mongoose from "mongoose";   

export class InitiConnection {
    private static instance: InitiConnection;
    private constructor() {
        this.connect();
    }

    public static getInstance(): InitiConnection {
        if (!InitiConnection.instance) {
            InitiConnection.instance = new InitiConnection();
        }
        return InitiConnection.instance;
    }

    private async connect() {

        if(!GLOBAL_ENV.MONGODB_URI) {
            throw new ResponseError(500, "MONGODB_URI is not defined");
        }

        try {
            const db = await mongoose.connect(
                GLOBAL_ENV.MONGODB_URI,
                {
                    dbName: "admintransporte_db",
                }
            );

            if(db.connection.readyState === 1) {
                console.log("Connected to MongoDB");
            }

        } catch (error) {
            if(error instanceof ResponseError) throw error;
            throw new Error(error as string);
        }
    }

    public async disconnect() {
        await mongoose.disconnect();
    }
    
}