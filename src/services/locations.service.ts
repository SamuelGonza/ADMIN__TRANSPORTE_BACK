import locationModel from "@/models/location.model";
import { ResponseError } from "@/utils/errors";

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
        company_id: string;
        search?: string;
        limit?: number;
    }) {
        try {
            const query: any = { company_id };
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
            throw new ResponseError(500, "No se pudieron listar los lugares");
        }
    }
}










