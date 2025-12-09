import { MediaTypes } from "@/contracts/globals";
import dotenv from "dotenv";
import mongoose from "mongoose";
dotenv.config();

export const ALLOWED_ORIGINS = [
    "http://localhost:5173", 
    "http://localhost:5174",
];
export const ALLOWED_METHODS = [
    "GET", 
    "POST", 
    "PUT", 
    "PATCH",
    "DELETE", 
    "OPTIONS"
];

export const GLOBAL_ENV = {
    MONGODB_URI: process.env.MONGODB_URI as string,

    PORT: process.env.PORT as string,
    JWT_SECRET: process.env.JWT_SECRET as string,

    CLOUD_NAME: process.env.CLOUD_NAME as string,
    API_KEY_CLOUDINARY: process.env.API_KEY_CLOUDINARY as string,
    API_SECRET_CLOUDINARY: process.env.API_SECRET_CLOUDINARY as string,
    NODE_ENV: process.env.NODE_ENV as string,

    MAILGUN_USER: process.env.MAILGUN_USER as string,
    MAILGUN_PORT: process.env.MAILGUN_PORT as string,
    MAILGUN_PASS: process.env.MAILGUN_PASS as string,

    FRONT_DOMAIN: process.env.FRONT_DOMAIN as string,
    ROUTER_SUBFIJE: process.env.ROUTER_SUBFIJE as string,
} as const;

export const DEFAULT_PROFILE: MediaTypes = {
    url: "https://res.cloudinary.com/appsftw/image/upload/v1764772117/i7zjlesfxqphkzofifyw.webp",
    public_id: "",      
    type: "image",
} as const;


export const mixed = mongoose.Schema.Types.Mixed
export const MongoIdRef = mongoose.Schema.Types.ObjectId;
