import { GLOBAL_ENV } from "@/utils/constants";
import { ResponseError } from "@/utils/errors";
import { AuthRequest } from "@/utils/express";
import { TokenSessionPayload } from "@/utils/generate";
import { NextFunction, Request, Response } from "express";
import jwt from 'jsonwebtoken'

/**
 * Middleware para consultar usuarios:
 * - superadmon: puede ver todos los usuarios
 * - admin: solo usuarios de su company_id
 * - coordinador: solo usuarios de su company_id
 * - contabilidad: solo usuarios de su company_id
 * - calidad: solo usuarios de su company_id (si existe este rol)
 */
export const UsersReadAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const token_session = req.cookies._session_token_;

        if(!token_session) throw new ResponseError(401, "No se proporcionó autorización")

        const decoded = jwt.verify(token_session, GLOBAL_ENV.JWT_SECRET) as TokenSessionPayload;

        if(!decoded) throw new ResponseError(401, "Token inválido");

        const allowedRoles = ["superadmon", "admin", "coordinador", "contabilidad", "comercial"];
        if(!allowedRoles.includes(decoded.role)) {
            throw new ResponseError(401, "No tienes permisos para consultar usuarios");
        }

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

