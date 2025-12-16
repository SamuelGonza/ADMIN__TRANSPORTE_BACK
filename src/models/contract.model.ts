import { Contract } from "@/contracts/interfaces/contract.interface";
import { MongoIdRef } from "@/utils/constants";
import mongoose, { Schema } from "mongoose";

const ContractHistorySchema: Schema = new Schema(
    {
        type: { type: String, required: true, enum: ["budget_set", "service_charge", "manual_adjust"] },
        created: { type: Date, default: new Date() },
        created_by: { type: MongoIdRef, ref: "User", required: false },
        notes: { type: String, required: false },

        prev_valor_presupuesto: { type: Number, required: false },
        new_valor_presupuesto: { type: Number, required: false },
        prev_valor_consumido: { type: Number, required: false },
        new_valor_consumido: { type: Number, required: false },

        solicitud_id: { type: MongoIdRef, ref: "Solicitud", required: false },
        amount: { type: Number, required: false },
        mode: { type: String, required: false, enum: ["within_contract", "outside_contract"] }
    },
    { _id: false }
);

const ContractSchema: Schema = new Schema<Contract>({
    company_id: { type: MongoIdRef, ref: "Companie", required: true },
    client_id: { type: MongoIdRef, ref: "Client", required: true },

    tipo_contrato: { type: String, required: true, enum: ["fijo"], default: "fijo" }, // Solo contratos fijos con presupuesto

    cobro: {
        modo_default: { type: String, required: false, enum: ["por_hora", "por_kilometro", "por_distancia", "tarifa_amva"] },
        por_hora: { type: Number, required: false },
        por_kilometro: { type: Number, required: false },
        por_distancia: { type: Number, required: false },
        tarifa_amva: { type: Number, required: false }
    },

    periodo_presupuesto: { type: String, required: false, enum: ["anio", "mes", "semana", "dia"] },
    valor_presupuesto: { type: Number, required: false, default: null },
    valor_consumido: { type: Number, required: true, default: 0 },

    historico: { type: [ContractHistorySchema], required: false, default: [] },

    is_active: { type: Boolean, default: true },
    created: { type: Date, default: new Date() },
    created_by: { type: MongoIdRef, ref: "User", required: false }
});

ContractSchema.index({ company_id: 1, client_id: 1, created: -1 });

export default mongoose.model<Contract>("Contract", ContractSchema);


