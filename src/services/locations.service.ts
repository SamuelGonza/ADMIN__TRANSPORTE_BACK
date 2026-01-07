import locationModel from "@/models/location.model";
import { ResponseError } from "@/utils/errors";
import mongoose from "mongoose";

export class LocationsService {
    private normalizeName(name: string) {
        return name
            .trim()
            .replace(/\s+/g, " ")
            .toUpperCase();
    }

    public async ensure_location({
        company_id,
        name
    }: {
        company_id: string;
        name: string;
    }) {
        try {
            if (!name || !name.trim()) throw new ResponseError(400, "El nombre del lugar es requerido");
            const normalized = this.normalizeName(name);

            const now = new Date();
            const doc = await locationModel.findOneAndUpdate(
                { company_id, normalized_name: normalized },
                {
                    $setOnInsert: { company_id, name: name.trim(), normalized_name: normalized, created: now },
                    $set: { last_used: now },
                    $inc: { usage_count: 1 }
                },
                { new: true, upsert: true }
            ).lean();

            return doc;
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo crear/obtener el lugar");
        }
    }

    public async list_locations({
        company_id,
        search,
        limit = 20
    }: {
        company_id: any; // Puede ser string, ObjectId, o objeto completo con _id
        search?: string;
        limit?: number;
    }) {
        try {
            // Validar company_id
            if (!company_id) {
                throw new ResponseError(400, "company_id es requerido");
            }

            // Normalizar company_id a string
            let company_id_str: string;
            if (typeof company_id === 'string') {
                company_id_str = company_id.trim();
            } else if (typeof company_id === 'object' && company_id !== null) {
                // Si viene como objeto, extraer el _id
                const obj = company_id as any;
                
                // Intentar obtener el _id del objeto
                if (obj._id !== undefined && obj._id !== null) {
                    // Si _id es un ObjectId de mongoose, usar toString()
                    try {
                        if (obj._id.toString && typeof obj._id.toString === 'function') {
                            company_id_str = obj._id.toString();
                        } else if (mongoose.Types.ObjectId.isValid(obj._id)) {
                            // Si _id es un ObjectId válido, convertirlo
                            company_id_str = new mongoose.Types.ObjectId(obj._id).toString();
                        } else if (typeof obj._id === 'string') {
                            company_id_str = obj._id;
                        } else {
                            // Intentar convertir a string
                            company_id_str = String(obj._id);
                        }
                    } catch (e) {
                        // Si falla, intentar convertir directamente
                        company_id_str = String(obj._id);
                    }
                } else {
                    // Si no tiene _id, el objeto puede ser un ObjectId directamente
                    // Intentar validar si el objeto completo es un ObjectId
                    try {
                        if (mongoose.Types.ObjectId.isValid(obj)) {
                            company_id_str = new mongoose.Types.ObjectId(obj).toString();
                        } else {
                            throw new ResponseError(400, `company_id debe ser un ObjectId válido. El objeto recibido no tiene _id válido.`);
                        }
                    } catch (e) {
                        if (e instanceof ResponseError) throw e;
                        throw new ResponseError(400, `company_id no es un formato válido. Debe ser un string ObjectId o un objeto con _id.`);
                    }
                }
            } else {
                company_id_str = String(company_id);
            }
            
            // Limpiar el string (remover espacios)
            company_id_str = company_id_str.trim();

            // Validar que es un ObjectId válido
            if (!mongoose.Types.ObjectId.isValid(company_id_str)) {
                console.error("company_id inválido recibido:", company_id, "tipo:", typeof company_id);
                throw new ResponseError(400, `company_id no es un ObjectId válido: ${company_id_str}`);
            }

            // Convertir a ObjectId
            const company_id_obj = new mongoose.Types.ObjectId(company_id_str);

            const query: any = { company_id: company_id_obj };
            if (search && search.trim()) {
                query.normalized_name = { $regex: this.normalizeName(search), $options: "i" };
            }
            const locations = await locationModel
                .find(query)
                .sort({ usage_count: -1, last_used: -1 })
                .limit(limit)
                .lean();
            return locations;
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            console.error("Error en list_locations:", error);
            throw new ResponseError(500, "No se pudieron listar los lugares");
        }
    }
}










