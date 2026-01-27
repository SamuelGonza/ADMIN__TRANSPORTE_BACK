import { GLOBAL_ENV } from "@/utils/constants";
import { ResponseError } from "@/utils/errors";
import { AuthRequest } from "@/utils/express";
import { TokenSessionPayload } from "@/utils/generate";
import { NextFunction, Request, Response } from "express";
import jwt from 'jsonwebtoken'

/**
 * Middleware para descargar reportes PDF (fichas técnicas, manifiestos):
 * - contabilidad: puede descargar reportes
 * - coordinador_operador: puede descargar reportes
 * - coordinador_comercial: puede descargar reportes
 * - admin: puede descargar reportes
 * - superadmon: puede descargar reportes
 * - orquestador: puede descargar reportes (fichas técnicas de conductores)
 */
export const ReportsDownloadAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const token_session = req.cookies._session_token_;

        if(!token_session) throw new ResponseError(401, "No se proporcionó autorización");

        const decoded = jwt.verify(token_session, GLOBAL_ENV.JWT_SECRET) as TokenSessionPayload;

        if(!decoded) throw new ResponseError(401, "Token inválido");

        const allowedRoles = ["superadmon", "admin", "coordinador_operador", "coordinador_comercial", "contabilidad", "orquestador"];
        if(!allowedRoles.includes(decoded.role)) {
            throw new ResponseError(401, "No tienes permisos para descargar este reporte");
        }

        (req as AuthRequest).user = {
            _id: decoded._id,
            role: decoded.role,
            company_id: decoded.company_id
        };

        next();
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








