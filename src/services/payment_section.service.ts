import paymentSectionModel from "@/models/payment_section.model";
import vehicleModel from "@/models/vehicle.model";
import companyModel from "@/models/company.model";
import userModel from "@/models/user.model";
import vhc_operationalModel from "@/models/vhc_operational.model";
import vhc_preoperationalModel from "@/models/vhc_preoperational.model";
import { ResponseError } from "@/utils/errors";
import { PaymentSection, CuentaCobro } from "@/contracts/interfaces/payment_section.interface";
import mongoose from "mongoose";

export class PaymentSectionService {
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
            return paymentSection.toObject();
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
            
            return paymentSection;
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
            
            return paymentSection.toObject();
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo actualizar la cuenta de cobro");
        }
    }
}


