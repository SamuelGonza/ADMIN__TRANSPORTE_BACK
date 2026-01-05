import bitacoraModel from "@/models/bitacora.model";
import companyModel from "@/models/company.model";
import dayjs from "dayjs";
import mongoose from "mongoose";

/**
 * Servicio para gestionar la creación automática de bitácoras
 * Se ejecuta mediante cron job cada hora
 */
export class BitacoraCronService {
    /**
     * Verifica y crea bitácoras para todas las compañías
     * Solo crea la bitácora del mes actual si no existe
     */
    public async ensureBitacorasForAllCompanies(): Promise<void> {
        try {

            // Obtener todas las compañías
            const companies = await companyModel.find({}).select("_id").lean();
            
            if (!companies || companies.length === 0) {
                return;
            }

            const now = dayjs();
            const currentYear = now.format('YYYY');
            const currentMonth = now.format('MM');

            let createdCount = 0;
            let existingCount = 0;

            // Para cada compañía, verificar y crear bitácora del mes actual solamente
            for (const company of companies) {
                const company_id = company._id;

                // Verificar y crear bitácora del mes actual
                const created = await this.ensureBitacoraForCompany({
                    company_id: company_id.toString(),
                    year: currentYear,
                    month: currentMonth
                });

                if (created) {
                    createdCount++;
                } else {
                    existingCount++;
                }
            }

        } catch (error) {
            throw error;
        }
    }

    /**
     * Verifica si existe una bitácora para una compañía, año y mes específicos
     * Si no existe, la crea
     * @returns true si se creó, false si ya existía
     */
    private async ensureBitacoraForCompany({
        company_id,
        year,
        month
    }: {
        company_id: string;
        year: string;
        month: string;
    }): Promise<boolean> {
        try {
            const company_id_obj = new mongoose.Types.ObjectId(company_id);

            // Verificar si ya existe
            const existing = await bitacoraModel.findOne({
                company_id: company_id_obj,
                year,
                month
            });

            if (existing) {
                return false; // Ya existe
            }

            // Crear la bitácora
            try {
                await bitacoraModel.create({
                    company_id: company_id_obj,
                    year,
                    month,
                    created: new Date()
                });

                return true; // Se creó
            } catch (createError: any) {
                // Si el error es por duplicado (índice único), verificar nuevamente
                if (createError.code === 11000 || createError.name === 'MongoServerError') {
                    // Verificar si realmente existe ahora (puede haber sido creada por otro proceso)
                    const exists = await bitacoraModel.findOne({
                        company_id: company_id_obj,
                        year,
                        month
                    });
                    
                    if (exists) {
                        return false; // Ya existe, no se creó
                    }
                }
                throw createError; // Re-lanzar si es otro tipo de error
            }
        } catch (error) {
            throw error;
        }
    }

}
