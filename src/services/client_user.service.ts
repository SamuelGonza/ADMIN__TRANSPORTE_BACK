import { ClientUser } from "@/contracts/interfaces/client_user.interface";
import clientUserModel from "@/models/client_user.model";
import clientModel from "@/models/client.model";
import { ResponseError } from "@/utils/errors";
import { generate_password, hash_password } from "@/utils/generate";
import { send_client_user_credentials } from "@/email/index.email";

export class ClientUserService {

    //* #========== POST METHODS ==========#
    public async create_client_user({ 
        payload, 
        company_id,
        cliente_id,
        created_by
    }: { 
        payload: {
            full_name: string;
            email: string;
        }, 
        company_id: string,
        cliente_id: string,
        created_by?: string
    }) {
        try {
            const { full_name, email } = payload;

            // Verificar que el cliente existe y pertenece a la misma compañía
            const client = await clientModel.findById(cliente_id).select("name company_id");
            if (!client) {
                throw new ResponseError(404, "El cliente no fue encontrado");
            }

            // Verificar que el cliente pertenece a la misma compañía
            const clientCompanyId = client.company_id 
                ? (typeof client.company_id === 'string' 
                    ? client.company_id 
                    : (client.company_id as any)?._id?.toString() || (client.company_id as any)?.toString())
                : null;

            if (clientCompanyId !== company_id) {
                throw new ResponseError(403, "El cliente no pertenece a esta compañía");
            }

            // Verificar que el email no existe
            const existingUser = await clientUserModel.findOne({ email });
            if (existingUser) {
                throw new ResponseError(409, "Este email ya está registrado");
            }

            // Generar contraseña
            const plane_password = generate_password();
            const hashed_password = await hash_password(plane_password);

            // Crear el subusuario
            const new_client_user = await clientUserModel.create({
                full_name,
                email,
                password: hashed_password,
                company_id,
                cliente_id
            });

            await new_client_user.save();

            // Enviar email con credenciales
            await send_client_user_credentials({
                full_name,
                email,
                password: plane_password,
                client_name: client.name
            });

            return {
                _id: new_client_user._id,
                full_name: new_client_user.full_name,
                email: new_client_user.email,
                cliente_id: new_client_user.cliente_id,
                company_id: new_client_user.company_id,
                created: new_client_user.created
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo crear el subusuario del cliente");
        }
    }

    //* #========== GET METHODS ==========#
    public async get_all_client_users({ filters, page = 1, limit = 10 }: {
        filters: {
            company_id?: string,
            cliente_id?: string,
            full_name?: string,
            email?: string,
        },
        page?: number,
        limit?: number
    }) {
        try {
            // Construir el query de búsqueda
            const query: any = {};

            // Filtro por company_id (exacto)
            if (filters.company_id) {
                const companyId = typeof filters.company_id === 'string' 
                    ? filters.company_id 
                    : (filters.company_id as any)?._id?.toString() || (filters.company_id as any)?.toString();
                
                if (companyId && /^[0-9a-fA-F]{24}$/.test(companyId)) {
                    query.company_id = companyId;
                } else {
                    throw new ResponseError(400, "company_id inválido");
                }
            }

            // Filtro por cliente_id
            if (filters.cliente_id) {
                const clienteId = typeof filters.cliente_id === 'string' 
                    ? filters.cliente_id 
                    : (filters.cliente_id as any)?._id?.toString() || (filters.cliente_id as any)?.toString();
                
                if (clienteId && /^[0-9a-fA-F]{24}$/.test(clienteId)) {
                    query.cliente_id = clienteId;
                } else {
                    throw new ResponseError(400, "cliente_id inválido");
                }
            }

            // Filtros de búsqueda global (case-insensitive)
            if (filters.full_name) {
                query.full_name = { $regex: new RegExp(filters.full_name, 'i') };
            }

            if (filters.email) {
                query.email = { $regex: new RegExp(filters.email, 'i') };
            }

            // Calcular skip para paginación
            const skip = (page - 1) * limit;

            // Ejecutar query con paginación y populate
            const client_users = await clientUserModel
                .find(query)
                .populate('company_id', 'name document')
                .populate('cliente_id', 'name email')
                .sort({ created: -1 })
                .skip(skip)
                .limit(limit)
                .select('-password')
                .lean();

            // Contar total de documentos para paginación
            const total = await clientUserModel.countDocuments(query);

            return {
                client_users,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo obtener los subusuarios del cliente");
        }
    }
    
    public async get_client_user_by_id({id}: {id: string}){
        try {
            const find_user = await clientUserModel
                .findById(id)
                .populate('company_id', 'name document')
                .populate('cliente_id', 'name email contacts phone')
                .select("-password")
                .lean();
            
            if(!find_user) throw new ResponseError(404, "El subusuario del cliente no fue encontrado");
            
            return find_user;
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo buscar el subusuario del cliente");
        }
    }

    //* #========== PUT METHODS ==========#
    public async update_client_user_info({id, payload}: {id: string, payload: Partial<ClientUser>}){
        try {
            const { full_name } = payload as any;
            const find_user = await clientUserModel.findById(id);
            
            if(!find_user) throw new ResponseError(404, "El subusuario del cliente no fue encontrado");

            if (full_name) {
                find_user.full_name = full_name;
            }

            await find_user.save();
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo actualizar el subusuario del cliente");
        }
    }

    //* #========== DELETE METHODS ==========#
    public async delete_client_user({id}: {id: string}){
        try {
            const find_user = await clientUserModel.findById(id);
            if(!find_user) throw new ResponseError(404, "El subusuario del cliente no fue encontrado");

            await clientUserModel.findByIdAndDelete(id);
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo eliminar el subusuario del cliente");
        }
    }

    //* #========== LOGIN METHOD ==========#
    public async login({ email, password }: { email: string, password: string }) {
        try {
            const { compare_password, generate_token_session } = await import("@/utils/generate");
            
            const find_client_user = await clientUserModel
                .findOne({ email })
                .select("full_name email company_id cliente_id password")
                .populate('company_id', 'name document')
                .populate('cliente_id', 'name email');

            if (!find_client_user) throw new ResponseError(404, "Cuenta no encontrada");

            const ok_password = await compare_password(password, find_client_user.password);

            if (!ok_password) throw new ResponseError(401, "Contraseña incorrecta");

            // Extraer el ID de company_id (puede ser ObjectId o objeto populado)
            const companyId = find_client_user.company_id 
                ? (typeof find_client_user.company_id === 'string' 
                    ? find_client_user.company_id 
                    : (find_client_user.company_id as any)?._id?.toString() || (find_client_user.company_id as any)?.toString())
                : undefined;

            const token = generate_token_session({ 
                id: find_client_user._id.toString(), 
                role: "cliente" as any, 
                company_id: companyId 
            });

            return {
                token,
                client: {
                    _id: find_client_user._id,
                    full_name: find_client_user.full_name,
                    email: find_client_user.email,
                    company_id: (find_client_user.company_id as any)?._id,
                    company_name: (find_client_user.company_id as any)?.name,
                    company_document: (find_client_user.company_id as any)?.document,
                    cliente_id: (find_client_user.cliente_id as any)?._id,
                    cliente_name: (find_client_user.cliente_id as any)?.name,
                    is_client_user: true // Flag para identificar que es un subusuario
                }
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo autenticar el subusuario del cliente");
        }
    }
}
