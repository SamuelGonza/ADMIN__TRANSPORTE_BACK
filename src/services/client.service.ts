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
                por_viaje?: number;
                por_trayecto?: number;
            };
            notes?: string;
        }
    }) {
        try {

            const {
                name,
                contacts,
                email,
                phone
            } = payload as any;

            await this.verify_exist_client({ name, company_id })

            // Manejar retrocompatibilidad: si viene contact_name/contact_phone, convertirlos a contacts
            let contactsArray: Array<{ name: string; phone: string }> = [];
            if (contacts && Array.isArray(contacts) && contacts.length > 0) {
                contactsArray = contacts;
            } else if ((payload as any).contact_name && (payload as any).contact_phone) {
                // Retrocompatibilidad: convertir contact_name/contact_phone a contacts
                contactsArray = [{ name: (payload as any).contact_name, phone: (payload as any).contact_phone }];
            } else {
                throw new ResponseError(400, "Se requiere al menos un contacto (name y phone)");
            }

            const plane_password = generate_password()
            const hashed_password = await hash_password(plane_password)
            const new_client = await clientModel.create({
                name,
                contacts: contactsArray,
                phone: phone || contactsArray[0]?.phone || "", // Teléfono principal para retrocompatibilidad
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

            // Enviar correo al cliente sobre el registro y credenciales (usar el primer contacto)
            await send_client_registration_credentials({
                name: contactsArray[0]?.name || name,
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
                .select("name contacts phone email company_id password")
                .populate('company_id', 'name document');

            if (!find_client) throw new ResponseError(404, "Cuenta no encontrada");

            const ok_password = await compare_password(password, find_client.password);

            if (!ok_password) throw new ResponseError(401, "Contraseña incorrecta");

            // Extraer el ID de company_id (puede ser ObjectId o objeto populado)
            const companyId = find_client.company_id 
                ? (typeof find_client.company_id === 'string' 
                    ? find_client.company_id 
                    : (find_client.company_id as any)?._id?.toString() || (find_client.company_id as any)?.toString())
                : undefined;

            const token = generate_token_session({ id: find_client._id.toString(), role: "cliente" as any, company_id: companyId });

            return {
                token,
                client: {
                    _id: find_client._id,
                    name: find_client.name,
                    contacts: find_client.contacts || [],
                    phone: find_client.phone,
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

            // Búsqueda en el array de contactos
            if (filters.contact_name || filters.contact_phone) {
                query.$or = query.$or || [];
                if (filters.contact_name) {
                    query.$or.push({ "contacts.name": { $regex: new RegExp(filters.contact_name, 'i') } });
                }
                if (filters.contact_phone) {
                    query.$or.push({ "contacts.phone": { $regex: new RegExp(filters.contact_phone, 'i') } });
                }
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
                contacts,
                phone,
                email
            } = payload as any;
            const find_user = await clientModel.findById(id)
            if(!find_user) throw new ResponseError(404, "El cliente no fue encontrado")

            find_user.name = name;
            find_user.email = email;
            
            // Manejar retrocompatibilidad: si viene contact_name/contact_phone, convertirlos a contacts
            if (contacts && Array.isArray(contacts) && contacts.length > 0) {
                find_user.contacts = contacts;
            } else if ((payload as any).contact_name && (payload as any).contact_phone) {
                // Retrocompatibilidad: convertir contact_name/contact_phone a contacts
                find_user.contacts = [{ name: (payload as any).contact_name, phone: (payload as any).contact_phone }];
            }
            
            // Actualizar teléfono principal si se proporciona
            if (phone !== undefined) {
                find_user.phone = phone;
            } else if (find_user.contacts && find_user.contacts.length > 0) {
                // Si no se proporciona phone pero hay contactos, usar el primero
                find_user.phone = find_user.contacts[0].phone;
            }
            
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
            const client_info = await clientModel.findById(id).select("name contacts email").lean();
            if (client_info) {
                const firstContactName = (client_info as any).contacts && (client_info as any).contacts.length > 0 
                    ? (client_info as any).contacts[0].name 
                    : client_info.name;
                await send_client_new_password({
                    name: firstContactName,
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