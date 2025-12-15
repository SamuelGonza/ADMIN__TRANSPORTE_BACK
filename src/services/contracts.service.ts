import contractModel from "@/models/contract.model";
import clientModel from "@/models/client.model";
import { ResponseError } from "@/utils/errors";
import { Contract, ContractBudgetPeriod, ContractPricingMode, ContractType } from "@/contracts/interfaces/contract.interface";

export class ContractsService {
    public async create_contract({
        company_id,
        created_by,
        payload
    }: {
        company_id: string;
        created_by?: string;
        payload: {
            client_id: string;
            tipo_contrato: ContractType;
            periodo_presupuesto?: ContractBudgetPeriod;
            valor_presupuesto?: number | null;
            cobro?: {
                modo_default?: ContractPricingMode;
                por_hora?: number;
                por_kilometro?: number;
                por_distancia?: number;
                tarifa_amva?: number;
            };
            notes?: string;
        };
    }) {
        try {
            const client = await clientModel.findById(payload.client_id).select("_id company_id").lean();
            if (!client) throw new ResponseError(404, "Cliente no encontrado");
            if (String(client.company_id) !== String(company_id)) throw new ResponseError(401, "El cliente no pertenece a tu empresa");

            // Reglas mínimas
            if (payload.tipo_contrato === "fijo") {
                if (payload.valor_presupuesto == null || Number.isNaN(payload.valor_presupuesto)) {
                    throw new ResponseError(400, "valor_presupuesto es requerido para contrato fijo");
                }
                if (!payload.periodo_presupuesto) throw new ResponseError(400, "periodo_presupuesto es requerido para contrato fijo");
            }

            const contrato = await contractModel.create({
                company_id,
                client_id: payload.client_id,
                tipo_contrato: payload.tipo_contrato,
                cobro: payload.cobro || undefined,
                periodo_presupuesto: payload.periodo_presupuesto,
                valor_presupuesto: payload.valor_presupuesto ?? null,
                valor_consumido: 0,
                created_by: created_by || undefined,
                historico: [
                    {
                        type: "budget_set",
                        created: new Date(),
                        created_by: created_by || undefined,
                        notes: payload.notes || "Creación de contrato",
                        prev_valor_presupuesto: null,
                        new_valor_presupuesto: payload.valor_presupuesto ?? null,
                        prev_valor_consumido: 0,
                        new_valor_consumido: 0
                    }
                ]
            } as unknown as Partial<Contract>);

            await contrato.save();
            return contrato.toObject();
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo crear el contrato");
        }
    }

    public async get_contract_by_id({ id, company_id }: { id: string; company_id?: string }) {
        try {
            const query: any = { _id: id };
            if (company_id) query.company_id = company_id;
            const contrato = await contractModel
                .findOne(query)
                .populate("client_id", "name contact_name contact_phone email")
                .populate("created_by", "full_name email role")
                .lean();
            if (!contrato) throw new ResponseError(404, "Contrato no encontrado");
            return contrato;
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo obtener el contrato");
        }
    }

    public async get_contracts_by_client({
        client_id,
        company_id,
        only_active = false
    }: {
        client_id: string;
        company_id?: string;
        only_active?: boolean;
    }) {
        try {
            const query: any = { client_id };
            if (company_id) query.company_id = company_id;
            if (only_active) query.is_active = true;

            const contratos = await contractModel
                .find(query)
                .sort({ created: -1 })
                .lean();
            return contratos;
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudieron listar los contratos");
        }
    }

    public async update_contract({
        id,
        company_id,
        payload,
        updated_by
    }: {
        id: string;
        company_id?: string;
        updated_by?: string;
        payload: Partial<{
            tipo_contrato: ContractType;
            periodo_presupuesto: ContractBudgetPeriod;
            valor_presupuesto: number | null;
            cobro: {
                modo_default?: ContractPricingMode;
                por_hora?: number;
                por_kilometro?: number;
                por_distancia?: number;
                tarifa_amva?: number;
            };
            is_active: boolean;
            notes: string;
        }>;
    }) {
        try {
            const query: any = { _id: id };
            if (company_id) query.company_id = company_id;

            const contrato = await contractModel.findOne(query);
            if (!contrato) throw new ResponseError(404, "Contrato no encontrado");

            const prev_presupuesto = contrato.valor_presupuesto ?? null;
            const prev_consumido = contrato.valor_consumido;

            if (payload.tipo_contrato) contrato.tipo_contrato = payload.tipo_contrato;
            if (payload.periodo_presupuesto) contrato.periodo_presupuesto = payload.periodo_presupuesto;
            if (payload.valor_presupuesto !== undefined) contrato.valor_presupuesto = payload.valor_presupuesto;
            if (payload.cobro !== undefined) (contrato as any).cobro = payload.cobro;
            if (payload.is_active !== undefined) contrato.is_active = payload.is_active;

            // Si se tocó presupuesto/tipo, dejamos rastro
            const presupuesto_changed = payload.valor_presupuesto !== undefined || payload.periodo_presupuesto !== undefined || payload.tipo_contrato !== undefined;
            if (presupuesto_changed) {
                contrato.historico.push({
                    type: "budget_set",
                    created: new Date(),
                    created_by: (updated_by as any) || undefined,
                    notes: payload.notes || "Actualización de contrato",
                    prev_valor_presupuesto: prev_presupuesto ?? null,
                    new_valor_presupuesto: contrato.valor_presupuesto ?? null,
                    prev_valor_consumido: prev_consumido,
                    new_valor_consumido: contrato.valor_consumido
                } as any);
            }

            await contrato.save();
            return contrato.toObject();
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo actualizar el contrato");
        }
    }

    public async charge_contract({
        contract_id,
        company_id,
        amount,
        solicitud_id,
        created_by,
        notes
    }: {
        contract_id: string;
        company_id?: string;
        amount: number;
        solicitud_id?: string;
        created_by?: string;
        notes?: string;
    }) {
        try {
            if (!amount || amount <= 0) throw new ResponseError(400, "amount debe ser mayor a 0");

            const query: any = { _id: contract_id };
            if (company_id) query.company_id = company_id;

            const contrato = await contractModel.findOne(query);
            if (!contrato) throw new ResponseError(404, "Contrato no encontrado");
            if (!contrato.is_active) throw new ResponseError(400, "El contrato está inactivo");

            const prev_consumido = contrato.valor_consumido;
            const new_consumido = prev_consumido + amount;

            // Si hay presupuesto definido, no permitir excederlo (regla segura por defecto)
            if (contrato.valor_presupuesto != null && new_consumido > contrato.valor_presupuesto) {
                throw new ResponseError(400, "El cargo excede el valor_presupuesto del contrato");
            }

            contrato.valor_consumido = new_consumido;
            contrato.historico.push({
                type: "service_charge",
                created: new Date(),
                created_by: (created_by as any) || undefined,
                notes: notes || "Cargo por servicio",
                prev_valor_presupuesto: contrato.valor_presupuesto ?? null,
                new_valor_presupuesto: contrato.valor_presupuesto ?? null,
                prev_valor_consumido: prev_consumido,
                new_valor_consumido: new_consumido,
                solicitud_id: (solicitud_id as any) || undefined,
                amount,
                mode: "within_contract"
            } as any);

            await contrato.save();
            return contrato.toObject();
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo descontar del contrato");
        }
    }
}


