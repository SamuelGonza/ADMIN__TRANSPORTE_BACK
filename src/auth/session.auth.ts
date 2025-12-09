import { GLOBAL_ENV } from "@/utils/constants";
import { ResponseError } from "@/utils/errors";
import { AuthRequest } from "@/utils/express";
import { TokenSessionPayload } from "@/utils/generate";
import { NextFunction, Request, Response } from "express";
import jwt from 'jsonwebtoken'

/**
 * Middleware para validar cualquier sesión activa (sin importar el rol)
 * Útil para endpoints de sesión como /me, /refresh, /logout
 */
export const SessionAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const token_session = req.cookies._session_token_;

        if(!token_session) throw new ResponseError(401, "No se proporcionó autorización")

        const decoded = jwt.verify(token_session, GLOBAL_ENV.JWT_SECRET) as TokenSessionPayload;

        if(!decoded) throw new ResponseError(401, "Token inválido");

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
        
        // Error de JWT (token expirado, inválido, etc.)
        if (error instanceof jwt.JsonWebTokenError) {
            res.status(401).json({
                ok: false,
                message: "Sesión expirada o inválida"
            });
            return;
        }
        
        res.status(500).json({
            ok: false,
            message: "Error al autenticar la sesión"
        });
        return;
    }
}

