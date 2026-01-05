import { Request, Response } from "express";
import { LocationsService } from "@/services/locations.service";
import { ResponseError } from "@/utils/errors";
import { AuthRequest } from "@/utils/express";

export class LocationsController {
    private locationsService = new LocationsService();

    public async list_locations(req: Request, res: Response) {
        try {
            const company_id = (req as AuthRequest).user?.company_id || (req.query.company_id as string);
            const search = req.query.search as string | undefined;
            const limit = req.query.limit ? Number(req.query.limit) : 20;

            const data = await this.locationsService.list_locations({
                company_id,
                search,
                limit
            });

            res.status(200).json({
                message: "Lugares obtenidos correctamente",
                data
            });
        } catch (error) {
            if (error instanceof ResponseError) {
                res.status(error.statusCode).json({ ok: false, message: error.message });
                return;
            }
            res.status(500).json({ ok: false, message: "Error al listar lugares" });
        }
    }
}










