import { UserRoles } from "@/contracts/interfaces/user.interface";
import { Request } from "express";

export interface AuthRequest extends Request {
    user: {
        _id: string;
        role: UserRoles;
        company_id?: string;
    };
}