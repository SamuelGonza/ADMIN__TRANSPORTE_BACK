import { Companies } from "@/contracts/interfaces/company.interface";
import { User } from "@/contracts/interfaces/user.interface";
import companyModel from "@/models/company.model";
import { DEFAULT_PROFILE } from "@/utils/constants";
import { ResponseError } from "@/utils/errors";

export class CompanyService {

    private static _userService: import("./users.service").UserService | null = null;

    private static get UserService(): import("./users.service").UserService {
        if (!this._userService) {
            const { UserService } = require("./users.service");
            this._userService = new UserService();
        }
        return this._userService!;
    }


    //* #========== POST METHODS ==========#
    public async create_new_company({ c_payload, admin_payload }: { c_payload: Companies, admin_payload: User }) {
        try {
            const {
                company_name,
                document,
            } = c_payload;

            await this.verify_exist_company({ document, name: company_name })

            const newCompany = await companyModel.create({
                company_name,
                document,
                logo: DEFAULT_PROFILE,
                simba_token: "",
                fe_id_ref: "",
                created: new Date()
            })
            await newCompany.save()


            await CompanyService.UserService.create_new_user({
                payload: admin_payload,
                company_id: (newCompany._id as any).toString(),
                skip_company_validation: true,
                is_new_company: true
            })


        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo registrar el nuevo ususario")
        }
    }


    //* #========== GET METHODS ==========#
    public async get_all_companies({ filters, page = 1, limit = 10 }: {
        filters: {
            name?: string;
            document?: number;
            created?: string;
        },
        page?: number,
        limit?: number
    }) {
        try {
            // Construir el objeto de consulta dinámicamente
            const query: any = {};

            // Filtro por nombre de compañía (búsqueda parcial, case-insensitive)
            if (filters.name) {
                query.company_name = { $regex: filters.name, $options: 'i' };
            }

            // Filtro por número de documento
            if (filters.document) {
                query['document.number'] = filters.document;
            }

            // Filtro por fecha de creación
            if (filters.created) {
                query.created = { $gte: new Date(filters.created) };
            }

            // Calcular skip para paginación
            const skip = (page - 1) * limit;

            // Ejecutar consulta con paginación
            const [companies, total] = await Promise.all([
                companyModel
                    .find(query)
                    .skip(skip)
                    .limit(limit)
                    .sort({ created: -1 }) // Ordenar por fecha de creación (más recientes primero)
                    .lean(),
                companyModel.countDocuments(query) // Contar total de documentos que coinciden
            ]);

            return {
                companies,
                pagination: {
                    current_page: page,
                    total_pages: Math.ceil(total / limit),
                    total_companies: total,
                    limit,
                    has_next_page: page < Math.ceil(total / limit),
                    has_prev_page: page > 1
                }
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudieron obtener las compañías");
        }
    }

    public async get_company_by({company_id}: {company_id: string}){
        try {
            const find_company = await companyModel.findById(company_id)
            if(!find_company) throw new ResponseError(404, "No se encontro a compañia")

            return find_company.toObject()
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo obtener la compañía");
        }
    }

    public async get_company_fe_info({company_id}: {company_id: string}){
        try {
            const find_company = await companyModel.findById(company_id).select("simba_token fe_id_ref")
            if(!find_company) throw new ResponseError(404, "No se encontro a compañia")

            return {
                simba_token: find_company.simba_token,
                fe_id: find_company.fe_id_ref
            }
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo obtener la informacion de facturacion.")
        }
    }


    //* #========== PUBLIC METHODS ==========#

    public async verify_exist_company_by_id(id: string) {
        try {
            const find = await companyModel.findById(id);
            if (!find) throw new ResponseError(404, "Esta compañia no existe")
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo validar la existencia de la empresa")
        }
    }


    //* #========== PRIVATE METHODS ==========#
    private async verify_exist_company({ document, name }: { document: Companies["document"], name: string }) {
        try {
            const find = await companyModel.findOne({
                $or: [
                    { "document.number": document.number },
                    { company_name: name }
                ]
            });
            if (find) throw new ResponseError(409, "Esta compañia ya existe")
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo validar la existencia de la empresa")
        }
    }

    
}