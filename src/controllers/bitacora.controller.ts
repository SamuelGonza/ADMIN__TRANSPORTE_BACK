import { Request, Response } from "express";
import { BitacoraService } from "@/services/bitacora.service";
import { ResponseError } from "@/utils/errors";
import { AuthRequest } from "@/utils/express";

export class BitacoraController {
    private bitacoraService = new BitacoraService();

    public async get_all_bitacoras(req: Request, res: Response) {
        try {
            const { page, limit, company_id, year, month } = req.query;
            const user_company_id = (req as AuthRequest).user?.company_id;
            
            // Normalizar company_id: si es objeto, extraer el _id; si es string, usarlo directamente
            let final_company_id: string | undefined;
            if (company_id) {
                final_company_id = typeof company_id === 'string' 
                    ? company_id 
                    : (company_id as any)?._id?.toString() || (company_id as any)?.toString();
            } else if (user_company_id) {
                final_company_id = typeof user_company_id === 'string' 
                    ? user_company_id 
                    : (user_company_id as any)?._id?.toString() || (user_company_id as any)?.toString();
            }

            if (!final_company_id) {
                throw new ResponseError(400, "company_id es requerido");
            }

            const filters = {
                company_id: final_company_id,
                year: year as string,
                month: month as string
            };

            const response = await this.bitacoraService.get_all_bitacoras({
                filters,
                page: page ? Number(page) : 1,
                limit: limit ? Number(limit) : 10
            });

            res.status(200).json({
                message: "Bitácoras obtenidas correctamente",
                data: response
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al obtener las bitácoras"
            });
            return;
        }
    }

    public async get_bitacora_by_id(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const response = await this.bitacoraService.get_bitacora_by_id({ id });
            res.status(200).json({
                message: "Bitácora obtenida correctamente",
                data: response
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al obtener la bitácora"
            });
            return;
        }
    }
}








