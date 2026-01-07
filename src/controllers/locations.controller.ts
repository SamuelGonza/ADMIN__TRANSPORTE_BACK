import { Request, Response } from "express";
import { LocationsService } from "@/services/locations.service";
import { ResponseError } from "@/utils/errors";
import { AuthRequest } from "@/utils/express";
import clientModel from "@/models/client.model";

export class LocationsController {
    private locationsService = new LocationsService();

    public async list_locations(req: Request, res: Response) {
        try {
            const user = (req as AuthRequest).user;
            // Dejar company_id como viene (puede ser string, ObjectId, o objeto completo)
            // El servicio se encargará de normalizarlo correctamente
            let company_id: any = user?.company_id;
            
            // Si es cliente y no tiene company_id en el token, obtenerlo de la BD
            if (!company_id && user?.role === 'cliente') {
                try {
                    const client = await clientModel.findById(user._id).select('company_id').lean();
                    if (client && (client as any).company_id) {
                        company_id = (client as any).company_id;
                    }
                } catch (clientError) {
                    console.error("Error al obtener company_id del cliente:", clientError);
                }
            }
            
            // Si no está en el token, intentar del query
            if (!company_id) {
                company_id = req.query.company_id as string;
            }

            const search = req.query.search as string | undefined;
            const limit = req.query.limit ? Number(req.query.limit) : 20;

            // Validar que company_id existe
            if (!company_id) {
                res.status(400).json({ 
                    ok: false, 
                    message: "company_id es requerido. Debe estar en el token o enviarse como query parameter." 
                });
                return;
            }

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
            console.error("Error al listar lugares:", error);
            res.status(500).json({ ok: false, message: "Error al listar lugares" });
        }
    }
}










