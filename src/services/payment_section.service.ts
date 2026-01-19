import paymentSectionModel from "@/models/payment_section.model";
import vehicleModel from "@/models/vehicle.model";
import companyModel from "@/models/company.model";
import userModel from "@/models/user.model";
import vhc_operationalModel from "@/models/vhc_operational.model";
import vhc_preoperationalModel from "@/models/vhc_preoperational.model";
import solicitudModel from "@/models/solicitud.model";
import { ResponseError } from "@/utils/errors";
import { PaymentSection, CuentaCobro } from "@/contracts/interfaces/payment_section.interface";
import mongoose from "mongoose";

export class PaymentSectionService {
    /**
     * Helper para convertir un ID (ObjectId, objeto populado, o string) a string
     */
    private idToString(id: any): string | undefined {
        if (!id) return undefined;
        if (typeof id === 'string') return id;
        if (typeof id === 'object') {
            // Si es un objeto populado, extraer el _id
            if (id._id) return id._id.toString();
            // Si es un ObjectId directo
            if (id.toString) return id.toString();
        }
        return String(id);
    }

    /**
     * Recalcula y actualiza la utilidad en la solicitud
     * Fórmula: utilidad = valor_a_facturar - valor_cancelado - total_gastos_operacionales
     */
    private async recalculateUtilidad(solicitud_id: string): Promise<void> {
        try {
            const solicitud = await solicitudModel.findById(solicitud_id);
            if (!solicitud) return;

            const valor_a_facturar = solicitud.valor_a_facturar || 0;
            const valor_cancelado = solicitud.valor_cancelado || 0;
            const total_gastos_operacionales = solicitud.total_gastos_operacionales || 0;

            // Calcular utilidad
            const utilidad = valor_a_facturar - valor_cancelado - total_gastos_operacionales;
            const porcentaje_utilidad = valor_a_facturar > 0 
                ? (utilidad / valor_a_facturar) * 100 
                : 0;

            // Actualizar utilidad en la solicitud
            solicitud.utilidad = utilidad;
            solicitud.porcentaje_utilidad = porcentaje_utilidad;

            await solicitud.save();
        } catch (error) {
            // No lanzar error, solo loguear para no interrumpir el flujo principal
            console.error(`Error al recalcular utilidad para solicitud ${solicitud_id}:`, error);
        }
    }

    /**
     * Normaliza un PaymentSection para asegurar que:
     * - Todos los IDs sean strings (no ObjectIds)
     * - valor_base siempre esté presente (puede ser 0)
     * - Los IDs coincidan exactamente con los de vehicle_assignments
     */
    private normalizePaymentSection(paymentSection: any): any {
        if (!paymentSection) return null;

        const normalized = {
            ...paymentSection,
            _id: this.idToString(paymentSection._id),
            solicitud_id: this.idToString(paymentSection.solicitud_id),
            company_id: this.idToString(paymentSection.company_id),
            created_by: this.idToString(paymentSection.created_by),
            updated_by: this.idToString(paymentSection.updated_by),
            cuentas_cobro: (paymentSection.cuentas_cobro || []).map((cuenta: any) => ({
                ...cuenta,
                // vehiculo_id DEBE ser string para que coincida con vehicle_assignments
                vehiculo_id: this.idToString(cuenta.vehiculo_id) || cuenta.vehiculo_id,
                conductor_id: this.idToString(cuenta.conductor_id),
                propietario: {
                    ...cuenta.propietario,
                    company_id: this.idToString(cuenta.propietario?.company_id),
                    user_id: this.idToString(cuenta.propietario?.user_id),
                },
                // Asegurar que valor_base siempre esté presente (puede ser 0)
                valor_base: cuenta.valor_base !== undefined && cuenta.valor_base !== null ? cuenta.valor_base : 0,
                gastos_operacionales: cuenta.gastos_operacionales !== undefined && cuenta.gastos_operacionales !== null ? cuenta.gastos_operacionales : 0,
                gastos_preoperacionales: cuenta.gastos_preoperacionales !== undefined && cuenta.gastos_preoperacionales !== null ? cuenta.gastos_preoperacionales : 0,
                valor_final: cuenta.valor_final !== undefined && cuenta.valor_final !== null ? cuenta.valor_final : 0,
            }))
        };

        return normalized;
    }

    /**
     * Crear o actualizar sección de pagos para una solicitud
     * Agrupa las cuentas de cobro por propietario de vehículo
     */
    public async create_or_update_payment_section({
        solicitud_id,
        company_id,
        vehicle_assignments,
        created_by
    }: {
        solicitud_id: string;
        company_id: string;
        vehicle_assignments: Array<{
            vehiculo_id: string;
            placa: string;
            conductor_id: string;
            flota: "externo" | "propio" | "afiliado";
        }>;
        created_by?: string;
    }) {
        try {
            // Buscar si ya existe una sección de pagos para esta solicitud
            let paymentSection = await paymentSectionModel.findOne({ solicitud_id });
            
            // Obtener información de los vehículos y sus propietarios
            const cuentasCobro: CuentaCobro[] = [];
            
            for (const assignment of vehicle_assignments) {
                const vehicle = await vehicleModel.findById(assignment.vehiculo_id)
                    .populate("owner_id.company_id")
                    .populate("owner_id.user_id")
                    .lean();
                
                if (!vehicle) {
                    throw new ResponseError(404, `Vehículo ${assignment.vehiculo_id} no encontrado`);
                }
                
                // Determinar el nombre del propietario
                let nombrePropietario = "";
                if (vehicle.owner_id.type === "Company") {
                    const company = vehicle.owner_id.company_id as any;
                    nombrePropietario = company?.company_name || "Compañía no encontrada";
                } else if (vehicle.owner_id.type === "User") {
                    const user = vehicle.owner_id.user_id as any;
                    nombrePropietario = user?.full_name || "Usuario no encontrado";
                }
                
                // Obtener gastos operacionales del vehículo para esta solicitud
                const gastosOperacionales = await vhc_operationalModel.find({
                    vehicle_id: assignment.vehiculo_id,
                    solicitud_id: solicitud_id
                }).lean();
                
                const totalGastosOperacionales = gastosOperacionales.reduce((sum, gasto) => {
                    const billsTotal = (gasto.bills || []).reduce((bSum: number, bill: any) => bSum + (bill.value || 0), 0);
                    return sum + billsTotal;
                }, 0);
                
                // Obtener gastos preoperacionales (si aplica)
                // Nota: Los gastos preoperacionales generalmente no se vinculan a solicitudes específicas
                // pero podrían calcularse por período o por vehículo
                const totalGastosPreoperacionales = 0; // Por ahora 0, se puede implementar después
                
                // Calcular valor base (esto debería venir de la solicitud o del contrato)
                // Por ahora usamos 0, se actualizará cuando se calcule la liquidación
                const valorBase = 0;
                
                // Calcular valor final
                const valorFinal = Math.max(0, valorBase - totalGastosOperacionales - totalGastosPreoperacionales);
                
                cuentasCobro.push({
                    vehiculo_id: vehicle._id as any,
                    placa: assignment.placa,
                    propietario: {
                        type: vehicle.owner_id.type as "Company" | "User",
                        company_id: vehicle.owner_id.company_id as any,
                        user_id: vehicle.owner_id.user_id as any,
                        nombre: nombrePropietario
                    },
                    conductor_id: assignment.conductor_id as any,
                    flota: assignment.flota,
                    valor_base: valorBase,
                    gastos_operacionales: totalGastosOperacionales,
                    gastos_preoperacionales: totalGastosPreoperacionales,
                    valor_final: valorFinal,
                    estado: "pendiente",
                    created: new Date(),
                    updated: new Date()
                });
            }
            
            // Calcular totales
            const total_valor_base = cuentasCobro.reduce((sum, cc) => sum + cc.valor_base, 0);
            const total_gastos_operacionales = cuentasCobro.reduce((sum, cc) => sum + cc.gastos_operacionales, 0);
            const total_gastos_preoperacionales = cuentasCobro.reduce((sum, cc) => sum + cc.gastos_preoperacionales, 0);
            const total_valor_final = cuentasCobro.reduce((sum, cc) => sum + cc.valor_final, 0);
            
            // Determinar estado general
            const estados = cuentasCobro.map(cc => cc.estado);
            let estadoGeneral: "pendiente" | "calculada" | "parcialmente_pagada" | "pagada" | "cancelada" = "pendiente";
            if (estados.every(e => e === "pagada")) {
                estadoGeneral = "pagada";
            } else if (estados.some(e => e === "pagada")) {
                estadoGeneral = "parcialmente_pagada";
            } else if (estados.every(e => e === "calculada")) {
                estadoGeneral = "calculada";
            }
            
            if (paymentSection) {
                // Actualizar sección existente
                paymentSection.cuentas_cobro = cuentasCobro as any;
                paymentSection.total_valor_base = total_valor_base;
                paymentSection.total_gastos_operacionales = total_gastos_operacionales;
                paymentSection.total_gastos_preoperacionales = total_gastos_preoperacionales;
                paymentSection.total_valor_final = total_valor_final;
                paymentSection.estado = estadoGeneral;
                paymentSection.updated = new Date();
                paymentSection.updated_by = created_by as any;
            } else {
                // Crear nueva sección
                paymentSection = await paymentSectionModel.create({
                    solicitud_id: solicitud_id as any,
                    company_id: company_id as any,
                    cuentas_cobro: cuentasCobro as any,
                    total_valor_base: total_valor_base,
                    total_gastos_operacionales: total_gastos_operacionales,
                    total_gastos_preoperacionales: total_gastos_preoperacionales,
                    total_valor_final: total_valor_final,
                    estado: estadoGeneral,
                    created_by: created_by as any
                });
            }
            
            await paymentSection.save();

            // Actualizar valor_cancelado en la solicitud asociada
            const totalValorCancelado = total_valor_base;
            await solicitudModel.findByIdAndUpdate(
                solicitud_id,
                { valor_cancelado: totalValorCancelado },
                { new: false }
            );

            // Recalcular utilidad automáticamente
            await this.recalculateUtilidad(solicitud_id);

            // Normalizar PaymentSection para asegurar IDs como strings y valor_base presente
            return this.normalizePaymentSection(paymentSection.toObject());
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo crear/actualizar la sección de pagos");
        }
    }
    
    /**
     * Obtener sección de pagos de una solicitud
     */
    public async get_payment_section_by_solicitud({ solicitud_id }: { solicitud_id: string }) {
        try {
            const paymentSection = await paymentSectionModel
                .findOne({ solicitud_id })
                .populate("solicitud_id")
                .populate("cuentas_cobro.vehiculo_id")
                .populate("cuentas_cobro.conductor_id", "full_name document")
                .populate("cuentas_cobro.propietario.company_id", "company_name document")
                .populate("cuentas_cobro.propietario.user_id", "full_name document")
                .lean();
            
            // Normalizar PaymentSection para asegurar IDs como strings y valor_base presente
            return this.normalizePaymentSection(paymentSection);
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo obtener la sección de pagos");
        }
    }
    
    /**
     * Actualizar valores de una cuenta de cobro específica
     * Se usa cuando se calcula la liquidación o se actualizan gastos
     */
    public async update_cuenta_cobro_values({
        solicitud_id,
        vehiculo_id,
        valor_base,
        gastos_operacionales,
        gastos_preoperacionales
    }: {
        solicitud_id: string;
        vehiculo_id: string;
        valor_base?: number;
        gastos_operacionales?: number;
        gastos_preoperacionales?: number;
    }) {
        try {
            const paymentSection = await paymentSectionModel.findOne({ solicitud_id });
            if (!paymentSection) {
                throw new ResponseError(404, "Sección de pagos no encontrada");
            }
            
            const cuentaCobro = paymentSection.cuentas_cobro.find(
                (cc: any) => String(cc.vehiculo_id) === String(vehiculo_id)
            );
            
            if (!cuentaCobro) {
                throw new ResponseError(404, "Cuenta de cobro no encontrada para este vehículo");
            }
            
            // Actualizar valores
            if (valor_base !== undefined) cuentaCobro.valor_base = valor_base;
            if (gastos_operacionales !== undefined) cuentaCobro.gastos_operacionales = gastos_operacionales;
            if (gastos_preoperacionales !== undefined) cuentaCobro.gastos_preoperacionales = gastos_preoperacionales;
            
            // Recalcular valor final
            cuentaCobro.valor_final = Math.max(0, 
                cuentaCobro.valor_base - cuentaCobro.gastos_operacionales - cuentaCobro.gastos_preoperacionales
            );
            
            cuentaCobro.updated = new Date();
            
            // Recalcular totales
            paymentSection.total_valor_base = paymentSection.cuentas_cobro.reduce(
                (sum: number, cc: any) => sum + cc.valor_base, 0
            );
            paymentSection.total_gastos_operacionales = paymentSection.cuentas_cobro.reduce(
                (sum: number, cc: any) => sum + cc.gastos_operacionales, 0
            );
            paymentSection.total_gastos_preoperacionales = paymentSection.cuentas_cobro.reduce(
                (sum: number, cc: any) => sum + cc.gastos_preoperacionales, 0
            );
            paymentSection.total_valor_final = paymentSection.cuentas_cobro.reduce(
                (sum: number, cc: any) => sum + cc.valor_final, 0
            );
            
            paymentSection.updated = new Date();
            await paymentSection.save();

            // Actualizar valor_cancelado en la solicitud asociada
            const totalValorCancelado = paymentSection.total_valor_base;
            await solicitudModel.findByIdAndUpdate(
                solicitud_id,
                { valor_cancelado: totalValorCancelado },
                { new: false }
            );

            // Recalcular utilidad automáticamente
            await this.recalculateUtilidad(solicitud_id);
            
            // Normalizar PaymentSection para asegurar IDs como strings y valor_base presente
            return this.normalizePaymentSection(paymentSection.toObject());
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo actualizar la cuenta de cobro");
        }
    }

    /**
     * Actualizar cuenta de cobro por paymentSectionId y vehiculoId
     * Endpoint: PUT /api/v1/payment-sections/:paymentSectionId/cuenta-cobro/:vehiculoId
     */
    public async update_cuenta_cobro_by_ids({
        paymentSectionId,
        vehiculoId,
        solicitud_id,
        vehiculo_id,
        valor_base,
        gastos_operacionales,
        gastos_preoperacionales,
        updated_by
    }: {
        paymentSectionId: string;
        vehiculoId: string;
        solicitud_id: string;
        vehiculo_id: string;
        valor_base: number;
        gastos_operacionales?: number;
        gastos_preoperacionales?: number;
        updated_by?: string;
    }) {
        try {
            // 1. Validar que la PaymentSection existe
            const paymentSection = await paymentSectionModel.findById(paymentSectionId);
            if (!paymentSection) {
                throw new ResponseError(404, "Sección de pagos no encontrada");
            }

            // 2. Validar que solicitud_id coincide con la solicitud asociada a la PaymentSection
            if (String(paymentSection.solicitud_id) !== String(solicitud_id)) {
                throw new ResponseError(400, "El solicitud_id no coincide con la sección de pagos");
            }

            // 3. Validar que vehiculo_id coincide con el parámetro de ruta
            if (String(vehiculoId) !== String(vehiculo_id)) {
                throw new ResponseError(400, "El vehiculo_id del body no coincide con el parámetro de ruta");
            }

            // 4. Validar que valor_base es un número positivo (o 0)
            if (valor_base < 0 || isNaN(valor_base)) {
                throw new ResponseError(400, "valor_base debe ser un número positivo o 0");
            }

            // 5. Buscar la cuenta de cobro del vehículo dentro de cuentas_cobro
            const cuentaCobro = paymentSection.cuentas_cobro.find(
                (cc: any) => String(cc.vehiculo_id) === String(vehiculoId)
            );

            if (!cuentaCobro) {
                throw new ResponseError(404, "Cuenta de cobro no encontrada para este vehículo en la sección de pagos");
            }

            // 6. Actualizar los valores
            cuentaCobro.valor_base = valor_base;
            if (gastos_operacionales !== undefined) {
                if (gastos_operacionales < 0 || isNaN(gastos_operacionales)) {
                    throw new ResponseError(400, "gastos_operacionales debe ser un número positivo o 0");
                }
                cuentaCobro.gastos_operacionales = gastos_operacionales;
            }
            if (gastos_preoperacionales !== undefined) {
                if (gastos_preoperacionales < 0 || isNaN(gastos_preoperacionales)) {
                    throw new ResponseError(400, "gastos_preoperacionales debe ser un número positivo o 0");
                }
                cuentaCobro.gastos_preoperacionales = gastos_preoperacionales;
            }

            // 7. Recalcular valor_final
            cuentaCobro.valor_final = Math.max(0, 
                cuentaCobro.valor_base - cuentaCobro.gastos_operacionales - cuentaCobro.gastos_preoperacionales
            );

            cuentaCobro.updated = new Date();

            // 8. Recalcular los totales de la PaymentSection
            paymentSection.total_valor_base = paymentSection.cuentas_cobro.reduce(
                (sum: number, cc: any) => sum + cc.valor_base, 0
            );
            paymentSection.total_gastos_operacionales = paymentSection.cuentas_cobro.reduce(
                (sum: number, cc: any) => sum + cc.gastos_operacionales, 0
            );
            paymentSection.total_gastos_preoperacionales = paymentSection.cuentas_cobro.reduce(
                (sum: number, cc: any) => sum + cc.gastos_preoperacionales, 0
            );
            paymentSection.total_valor_final = paymentSection.cuentas_cobro.reduce(
                (sum: number, cc: any) => sum + cc.valor_final, 0
            );

            paymentSection.updated = new Date();
            if (updated_by) {
                paymentSection.updated_by = updated_by as any;
            }

            // 9. Guardar los cambios
            await paymentSection.save();

            // 10. Actualizar valor_cancelado en la solicitud asociada
            const totalValorCancelado = paymentSection.total_valor_base;
            await solicitudModel.findByIdAndUpdate(
                paymentSection.solicitud_id,
                { valor_cancelado: totalValorCancelado },
                { new: false } // No necesitamos retornar el documento actualizado
            );

            // 11. Recalcular utilidad automáticamente
            await this.recalculateUtilidad(String(paymentSection.solicitud_id));

            // 12. Retornar la PaymentSection actualizada (con populate)
            const updatedPaymentSection = await paymentSectionModel
                .findById(paymentSectionId)
                .populate("solicitud_id")
                .populate("cuentas_cobro.vehiculo_id")
                .populate("cuentas_cobro.conductor_id", "full_name document")
                .populate("cuentas_cobro.propietario.company_id", "company_name document")
                .populate("cuentas_cobro.propietario.user_id", "full_name document")
                .lean();

            // Normalizar PaymentSection para asegurar IDs como strings y valor_base presente
            return this.normalizePaymentSection(updatedPaymentSection);
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo actualizar la cuenta de cobro");
        }
    }
}


