import { Client } from "@/contracts/interfaces/client.interface";
import clientModel from "@/models/client.model";
import { ResponseError } from "@/utils/errors";
import { compare_password, generate_password, generate_token_session, hash_password } from "@/utils/generate";
import { send_client_registration_credentials, send_client_new_password } from "@/email/index.email";
import { ContractsService } from "./contracts.service";
import { ContractPricingMode, ContractBudgetPeriod } from "@/contracts/interfaces/contract.interface";

export class ClientService {

    //* #========== POST METHODS ==========#
    public async create_client({ 
        payload, 
        company_id, 
        created_by,
        contract_data 
    }: { 
        payload: Client, 
        company_id: string,
        created_by?: string,
        contract_data?: {
            periodo_presupuesto: ContractBudgetPeriod;
            valor_presupuesto: number;
            cobro?: {
                modo_default?: ContractPricingMode;
                por_hora?: number;
                por_kilometro?: number;
                por_distancia?: number;
                tarifa_amva?: number;
            };
            notes?: string;
        }
    }) {
        try {

            const {
                name,
                contact_name,
                contact_phone,
                email
            } = payload;

            await this.verify_exist_client({ name, company_id })

            const plane_password = generate_password()
            const hashed_password = await hash_password(plane_password)
            const new_client = await clientModel.create({
                name,
                contact_phone,
                contact_name,
                email,
                company_id,
                password: hashed_password
            })

            await new_client.save()

            // Si se proporcionan datos de contrato, crear el contrato junto con el cliente
            if (contract_data) {
                const contractsService = new ContractsService();
                await contractsService.create_contract({
                    company_id,
                    created_by,
                    payload: {
                        client_id: new_client._id.toString(),
                        tipo_contrato: "fijo",
                        periodo_presupuesto: contract_data.periodo_presupuesto,
                        valor_presupuesto: contract_data.valor_presupuesto,
                        cobro: contract_data.cobro,
                        notes: contract_data.notes
                    }
                });
            }

            // Enviar correo al cliente sobre el registro y credenciales
            await send_client_registration_credentials({
                name: contact_name || name,
                email,
                password: plane_password
            });
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo registrar el cliente");
        }
    }

    public async login({ email, password }: { email: string, password: string }) {
        try {
            const find_client = await clientModel
                .findOne({ email })
                .select("name contact_name contact_phone email company_id password")
                .populate('company_id', 'name document');

            if (!find_client) throw new ResponseError(404, "Cuenta no encontrada");

            const ok_password = await compare_password(password, find_client.password);

            if (!ok_password) throw new ResponseError(401, "Contraseña incorrecta");

            const token = generate_token_session({ id: find_client._id.toString(), role: "cliente" as any, company_id: find_client.company_id.toString() });

            return {
                token,
                client: {
                    _id: find_client._id,
                    name: find_client.name,
                    contact_name: find_client.contact_name,
                    contact_phone: find_client.contact_phone,
                    email: find_client.email,
                    company_id: (find_client.company_id as any)?._id,
                    company_name: (find_client.company_id as any)?.name,
                    company_document: (find_client.company_id as any)?.document
                }
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo autenticar el cliente");
        }
    }


    //* #========== GET METHODS ==========#
    public async get_all_clients({ filters, page = 1, limit = 10 }: {
        filters: {
            company_id?: string,
            name?: string,
            email?: string,
            contact_name?: string,
            contact_phone?: string,
        },
        page?: number,
        limit?: number
    }) {
        try {
            // Construir el query de búsqueda
            const query: any = {};

            // Filtro por company_id (exacto)
            // Asegurar que company_id sea un string válido (ObjectId)
            if (filters.company_id) {
                // Si es un objeto, extraer el _id, si es string, usarlo directamente
                const companyId = typeof filters.company_id === 'string' 
                    ? filters.company_id 
                    : (filters.company_id as any)?._id?.toString() || (filters.company_id as any)?.toString();
                
                // Validar que sea un ObjectId válido (24 caracteres hex)
                if (companyId && /^[0-9a-fA-F]{24}$/.test(companyId)) {
                    query.company_id = companyId;
                } else {
                    throw new ResponseError(400, "company_id inválido");
                }
            }

            // Filtros de búsqueda global (case-insensitive)
            if (filters.name) {
                query.name = { $regex: new RegExp(filters.name, 'i') };
            }

            if (filters.email) {
                query.email = { $regex: new RegExp(filters.email, 'i') };
            }

            if (filters.contact_name) {
                query.contact_name = { $regex: new RegExp(filters.contact_name, 'i') };
            }

            if (filters.contact_phone) {
                query.contact_phone = { $regex: new RegExp(filters.contact_phone, 'i') };
            }

            // Calcular skip para paginación
            const skip = (page - 1) * limit;

            // Ejecutar query con paginación y populate
            const clients = await clientModel
                .find(query)
                .populate('company_id', 'name document') // Populate company info
                .sort({ created: -1 }) // Ordenar por fecha de creación (más recientes primero)
                .skip(skip)
                .limit(limit)
                .select('-password') // Excluir password por seguridad
                .lean();

            // Contar total de documentos para paginación
            const total = await clientModel.countDocuments(query);

            return {
                clients,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo obtener los clientes");
        }
    }
    
    public async get_client_by_id({id}: {id: string}){
        try {
            const find_user = await clientModel.findById(id).select("-password")
            if(!find_user) throw new ResponseError(404, "El cliente no fue encontrado")
            
            return find_user.toObject()
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo buscar el cliente");
        }
    }


    //* #========== PUT METHODS ==========#
    public async update_client_info({id, payload}: {id: string, payload: Client}){
        try {
            const {
                name,
                contact_name,
                contact_phone,
                phone,
                email
            } = payload;
            const find_user = await clientModel.findById(id)
            if(!find_user) throw new ResponseError(404, "El cliente no fue encontrado")

            find_user.name = name;
            find_user.contact_phone = contact_phone;
            find_user.contact_name = contact_name;
            find_user.phone = phone;
            find_user.email = email
            
            await find_user.save()
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo buscar el cliente");
        }
    }

    public async reset_client_password({id}: {id: string}){
        try {
            const find_user = await clientModel.findById(id).select("password email");
            if(!find_user) throw new ResponseError(404, "No se encontro el ususario")

            const new_password_plane = generate_password();
            const hashed_password = await hash_password(new_password_plane)

            find_user.password = hashed_password;
            await find_user.save()

            // Obtener información del cliente para el email
            const client_info = await clientModel.findById(id).select("name contact_name email").lean();
            if (client_info) {
                await send_client_new_password({
                    name: client_info.contact_name || client_info.name,
                    email: client_info.email,
                    password: new_password_plane
                });
            }
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo resetear la contraseña");
        }
    }

    //* #========== PRIVATE METHODS ==========#

    private async verify_exist_client({ name, company_id }: { name: string, company_id: string }) {
        try {
            // Búsqueda case-insensitive (ignora mayúsculas/minúsculas)
            const find = await clientModel.findOne({
                name: { $regex: new RegExp(`^${name}$`, 'i') },  // Case-insensitive
                company_id: company_id
            });

            if (find) throw new ResponseError(409, "Este cliente ya existe en la empresa");
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo validar la existencia del cliente");
        }
    }
}