import { Request, Response } from "express";
import facturaModel from "@/models/factura.model";
import solicitudModel from "@/models/solicitud.model";
import { ResponseError } from "@/utils/errors";
import { AuthRequest } from "@/utils/express";

export class FacturaController {
    
    public async get_factura_by_id(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const company_id = (req as AuthRequest).user?.company_id;
            const userRole = (req as AuthRequest).user?.role;
            const user_id = (req as AuthRequest).user?._id;

            // Buscar factura por ID
            const factura = await facturaModel.findById(id).populate("company_id");

            if (!factura) throw new ResponseError(404, "Factura no encontrada");

            const facturaCompanyId = typeof factura.company_id === 'object' 
                ? (factura.company_id as any)._id.toString() 
                : (factura.company_id as any).toString();

            // Si el usuario es cliente, verificar que tenga acceso a esta factura
            if (userRole === 'cliente' && user_id) {
                // Buscar si existe una solicitud con este factura_id
                const solicitud = await solicitudModel.findOne({ factura_id: id }).populate("cliente");
                
                if (!solicitud) {
                    throw new ResponseError(403, "No tienes permisos para ver esta factura");
                }

                // Obtener el cliente_id de la solicitud
                const solicitudClienteId = typeof solicitud.cliente === 'object' && solicitud.cliente !== null
                    ? (solicitud.cliente as any)._id?.toString() || (solicitud.cliente as any).toString()
                    : String(solicitud.cliente);

                // Verificar si el usuario es un ClientUser
                let clienteIdToCheck = user_id;
                try {
                    const { ClientUserService } = await import("@/services/client_user.service");
                    const clientUserService = new ClientUserService();
                    const clientUser = await clientUserService.get_client_user_by_id({ id: user_id });
                    
                    if (clientUser && clientUser.cliente_id) {
                        // Si es un client_user, usar el cliente_id del cliente asociado
                        clienteIdToCheck = typeof clientUser.cliente_id === 'string' 
                            ? clientUser.cliente_id 
                            : (clientUser.cliente_id as any)?._id?.toString() || (clientUser.cliente_id as any)?.toString();
                    }
                } catch (error) {
                    // Si no es client_user, continuar con el flujo normal usando user_id
                }

                // Validar que el cliente autenticado es el cliente asociado a la solicitud
                if (String(solicitudClienteId) !== String(clienteIdToCheck)) {
                    throw new ResponseError(403, "No tienes permisos para ver esta factura");
                }
            } else {
                // Para usuarios de gestión, verificar company_id
                if (company_id && facturaCompanyId !== String(company_id)) {
                    if (userRole !== 'superadmon') {
                        throw new ResponseError(403, "No tienes permisos para ver esta factura");
                    }
                }
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
