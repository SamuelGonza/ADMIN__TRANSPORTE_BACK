import { Request, Response } from "express";
import facturaModel from "@/models/factura.model";
import { ResponseError } from "@/utils/errors";
import { AuthRequest } from "@/utils/express";

export class FacturaController {
    
    public async get_factura_by_id(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const company_id = (req as AuthRequest).user?.company_id;

            // Buscar factura por ID
            const factura = await facturaModel.findById(id).populate("company_id");

            if (!factura) throw new ResponseError(404, "Factura no encontrada");

            const facturaCompanyId = typeof factura.company_id === 'object' 
                ? (factura.company_id as any)._id.toString() 
                : (factura.company_id as any).toString();

            if (company_id && facturaCompanyId !== String(company_id)) {
                const userRole = (req as AuthRequest).user?.role;
                if (userRole !== 'superadmon') throw new ResponseError(403, "No tienes permisos para ver esta factura");
            }

            res.status(200).json({
                message: "Factura obtenida correctamente",
                data: factura
            });

        } catch (error) {
            if (error instanceof ResponseError) {
                res.status(error.statusCode).json({ message: error.message });
                return;
            }
            res.status(500).json({ message: "Error interno al obtener la factura" });
        }
    }
}
