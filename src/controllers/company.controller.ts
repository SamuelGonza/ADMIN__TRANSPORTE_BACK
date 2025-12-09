import { Request, Response } from "express";
import { CompanyService } from "@/services/company.service";
import { ResponseError } from "@/utils/errors";
import { AuthRequest } from "@/utils/express";

export class CompanyController {
    private companyService = new CompanyService();

    public async create_company(req: Request, res: Response) {
        try {
            const { c_payload, admin_payload } = req.body;
            await this.companyService.create_new_company({ c_payload, admin_payload });
            res.status(201).json({ 
                message: "Compañía creada exitosamente"
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
                message: "Error al crear la compañía"
            });
            return;
        }
    }

    public async get_all_companies(req: Request, res: Response) {
        try {
            const { page, limit, name, document, created } = req.query;
            const filters = {
                name: name as string,
                document: document ? Number(document) : undefined,
                created: created as string,
            };

            const response = await this.companyService.get_all_companies({
                filters,
                page: page ? Number(page) : 1,
                limit: limit ? Number(limit) : 10
            });
            res.status(200).json({
                message: "Compañías obtenidas correctamente",
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
                message: "Error al obtener compañías"
            });
            return;
        }
    }

    public async get_company_by_id(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const user_company_id = (req as AuthRequest).user?.company_id;
            // Use user's company id if available (and they are not superadmin, implied by role check elsewhere)
            // Or just allow user_company_id to override if they are looking for their own.
            // If superadmin, they might provide ID in params. 
            // If company admin, they might provide ID in params too (e.g. looking at self).
            const target_id = user_company_id || id;

            const response = await this.companyService.get_company_by({ company_id: target_id });
            res.status(200).json({
                message: "Compañía obtenida correctamente",
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
                message: "Error al obtener la compañía"
            });
            return;
        }
    }

    public async get_company_fe_info(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const user_company_id = (req as AuthRequest).user?.company_id;
            const target_id = user_company_id || id;
            
            const response = await this.companyService.get_company_fe_info({ company_id: target_id });
            res.status(200).json({
                message: "Información de facturación obtenida correctamente",
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
                message: "Error al obtener información de facturación"
            });
            return;
        }
    }
}
