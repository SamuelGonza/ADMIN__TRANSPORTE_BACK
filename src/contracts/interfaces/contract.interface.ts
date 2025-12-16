import { Document, ObjectId } from "mongoose";

export type ContractType = "fijo"; // Solo contratos fijos con presupuesto. Los servicios sin contrato son ocasionales.
export type ContractBudgetPeriod = "anio" | "mes" | "semana" | "dia";
export type ContractHistoryEventType = "budget_set" | "service_charge" | "manual_adjust";
export type ContractPricingMode = "por_hora" | "por_kilometro" | "por_distancia" | "tarifa_amva";

export interface ContractHistoryEvent {
    type: ContractHistoryEventType;
    created: Date;
    created_by?: ObjectId;
    notes?: string;

    // Valores antes/después (para auditar)
    prev_valor_presupuesto?: number | null;
    new_valor_presupuesto?: number | null;
    prev_valor_consumido?: number;
    new_valor_consumido?: number;

    // Para cargos por servicio
    solicitud_id?: ObjectId;
    amount?: number;
    mode?: "within_contract" | "outside_contract";
}

export interface Contract extends Document {
    company_id: ObjectId;
    client_id: ObjectId;

    tipo_contrato: ContractType;

    // Tarifario / modo de cobro (para estimación y/o facturación)
    cobro?: {
        modo_default?: ContractPricingMode;
        por_hora?: number;        // COP por hora
        por_kilometro?: number;   // COP por km
        por_distancia?: number;   // COP por trayecto (valor fijo)
        tarifa_amva?: number;     // COP por tarifa AMVA (valor fijo)
    };

    // Presupuesto/consumo (requerido para contratos fijos)
    periodo_presupuesto?: ContractBudgetPeriod;
    valor_presupuesto?: number | null;
    valor_consumido: number;

    historico: ContractHistoryEvent[];

    is_active: boolean;
    created: Date;
    created_by?: ObjectId;
}


