import bitacoraModel from "@/models/bitacora.model";
import { ResponseError } from "@/utils/errors";

export class BitacoraService {
    
    //* #========== GET METHODS ==========#
    public async get_all_bitacoras({ 
        filters, 
        page = 1, 
        limit = 10 
    }: {
        filters: {
            company_id?: string;
            year?: string;
            month?: string;
        };
        page?: number;
        limit?: number;
    }) {
        try {
            const query: any = {};

            // Filtro por company_id (requerido)
            if (filters.company_id) {
                query.company_id = filters.company_id;
            } else {
                throw new ResponseError(400, "company_id es requerido");
            }

            // Filtro por año
            if (filters.year) {
                query.year = filters.year;
            }

            // Filtro por mes
            if (filters.month) {
                query.month = filters.month;
            }

            // Calcular skip para paginación
            const skip = (page - 1) * limit;

            // Ejecutar consulta con paginación y populate
            const [bitacoras, total] = await Promise.all([
                bitacoraModel
                    .find(query)
                    .populate('company_id', 'company_name logo')
                    .skip(skip)
                    .limit(limit)
                    .sort({ year: -1, month: -1 }) // Ordenar por año y mes (más recientes primero)
                    .lean(),
                bitacoraModel.countDocuments(query) // Contar total de documentos que coinciden
            ]);

            return {
                bitacoras,
                pagination: {
                    current_page: page,
                    total_pages: Math.ceil(total / limit),
                    total_bitacoras: total,
                    limit,
                    has_next_page: page < Math.ceil(total / limit),
                    has_prev_page: page > 1
                }
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudieron obtener las bitácoras");
        }
    }

    public async get_bitacora_by_id({ id }: { id: string }) {
        try {
            const bitacora = await bitacoraModel
                .findById(id)
                .populate('company_id', 'company_name logo')
                .lean();

            if (!bitacora) throw new ResponseError(404, "No se encontró la bitácora");

            return bitacora;
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo obtener la bitácora");
        }
    }
}

