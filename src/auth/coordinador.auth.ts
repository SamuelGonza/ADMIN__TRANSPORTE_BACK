import { GLOBAL_ENV } from "@/utils/constants";
import { ResponseError } from "@/utils/errors";
import { AuthRequest } from "@/utils/express";
import { TokenSessionPayload } from "@/utils/generate";
import { NextFunction, Request, Response } from "express";
import jwt from 'jsonwebtoken'

export const CoordinadorAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const token_session = req.cookies._session_token_;

        if(!token_session) throw new ResponseError(401, "No se proporciono autorizacion")

        const decoded = jwt.verify(token_session, GLOBAL_ENV.JWT_SECRET) as TokenSessionPayload;

        if(!decoded) if (!decoded) throw new ResponseError(401, "Token inválido");

        // Acceso Operativo:
        // - superadmon: dueños
        // - admin: administra su empresa
        // - coordinador: operación (asignaciones/validaciones)
        if(decoded.role != "superadmon" && decoded.role !== "admin" && decoded.role != "coordinador") throw new ResponseError(401, "No tienes permisos");

        (req as AuthRequest).user = {
            _id: decoded._id,
            role: decoded.role,
            company_id: decoded.company_id
        };

        next()
    } catch (error) {
        if (error instanceof ResponseError) {
            res.status(error.statusCode).json({
                ok: false,
                message: error.message
            });
            return;
        };
        res.status(500).json({
            ok: false,
            message: "Error al autenticar al usuario"
        });
        return;
    }
}