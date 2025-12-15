import { BitacoraSolicitud } from "@/contracts/interfaces/bitacora.interface";
import { MongoIdRef } from "@/utils/constants";
import mongoose, { Schema } from "mongoose";

const SolicitudSchema: Schema = new Schema<BitacoraSolicitud>({
    bitacora_id: { type: MongoIdRef, ref: "Bitacora", required: true },

    // Información básica del servicio
    he: { type: String, required: true }, // HE (código de servicio)
    empresa: { type: String, required: true, enum: ["travel", "national"] }, // EMPRESA
    fecha: { type: Date, required: true }, // FECHA
    hora_inicio: { type: String, required: true }, // HORA (inicio)
    hora_final: { type: String, required: true }, // HORA (final)
    total_horas: { type: Number, required: true }, // Total de horas

    // Cliente y contacto
    cliente: { type: MongoIdRef, ref: "Client", required: true }, // CLIENTE
    contacto: { type: String, required: true }, // CONTACTO

    // Ruta
    origen: { type: String, required: true }, // ORIGEN
    destino: { type: String, required: true }, // DESTINO
    novedades: { type: String, default: "" }, // NOVEDADES
    origen_location_id: { type: MongoIdRef, ref: "Location", required: false },
    destino_location_id: { type: MongoIdRef, ref: "Location", required: false },

    // Estimación de precio (según contrato/tarifario)
    estimated_km: { type: Number, required: false },
    estimated_hours: { type: Number, required: false },
    pricing_mode: { type: String, required: false, enum: ["por_hora", "por_kilometro", "por_distancia", "tarifa_amva"] },
    pricing_rate: { type: Number, required: false },
    estimated_price: { type: Number, required: false },

    // Vehículo y conductor
    vehiculo_id: { type: MongoIdRef, ref: "Vehicle", required: true }, // Referencia al vehículo
    placa: { type: String, required: true }, // PLACA
    tipo_vehiculo: { type: String, required: true }, // TIPO DE VEHÍCULO
    n_pasajeros: { type: Number, required: true }, // N° PASAJEROS
    flota: { type: String, required: true }, // FLOTA
    conductor: { type: MongoIdRef, ref: "User", required: true }, // CONDUCTOR
    conductor_phone: { type: String, required: true }, // Teléfono del conductor

    // Multi-vehículo (cuando se requieren varios buses)
    requested_passengers: { type: Number, required: false },
    vehicle_assignments: {
        type: [
            new Schema(
                {
                    vehiculo_id: { type: MongoIdRef, ref: "Vehicle", required: true },
                    placa: { type: String, required: true },
                    seats: { type: Number, required: true },
                    assigned_passengers: { type: Number, required: true },
                    conductor_id: { type: MongoIdRef, ref: "User", required: true },
                    conductor_phone: { type: String, required: false },

                    // "Contrato" por bus
                    contract_id: { type: MongoIdRef, ref: "Contract", required: false },
                    contract_charge_mode: { type: String, required: false, enum: ["within_contract", "outside_contract", "no_contract"], default: "no_contract" },
                    contract_charge_amount: { type: Number, required: false, default: 0 },

                    // Control contable por bus (opcional)
                    accounting: {
                        prefactura: {
                            numero: { type: String, required: false },
                            fecha: { type: Date, required: false }
                        },
                        preliquidacion: {
                            numero: { type: String, required: false },
                            fecha: { type: Date, required: false }
                        },
                        factura: {
                            numero: { type: String, required: false },
                            fecha: { type: Date, required: false }
                        },
                        doc_equivalente: {
                            numero: { type: String, required: false },
                            fecha: { type: Date, required: false }
                        },
                        pagos: {
                            type: [
                                new Schema(
                                    {
                                        fecha: { type: Date, required: false },
                                        valor: { type: Number, required: false },
                                        referencia: { type: String, required: false }
                                    },
                                    { _id: false }
                                )
                            ],
                            required: false,
                            default: []
                        },
                        notas: { type: String, required: false }
                    }
                },
                { _id: false }
            )
        ],
        required: false,
        default: []
    },

    // Información financiera - Gastos
    nombre_cuenta_cobro: { type: String, required: true }, // NOMBRE CUENTA DE COBRO
    valor_cancelado: { type: Number, required: true, default: 0 }, // VALOR CANCELADO
    doc_soporte: { type: String, default: "" }, // DOC SOPORTE
    fecha_cancelado: { type: Date }, // FECHA CANCELADO
    n_egreso: { type: String, default: "" }, // N° EGRESO

    // Información financiera - Ingresos
    valor_a_facturar: { type: Number, required: true, default: 0 }, // VALOR A FACTURAR
    n_factura: { type: String, default: "" }, // N° FACTURA
    fecha_factura: { type: Date }, // FECHA de factura

    // Utilidad
    utilidad: { type: Number, required: true, default: 0 }, // UTILIDAD (valor)
    porcentaje_utilidad: { type: Number, required: true, default: 0 }, // % (porcentaje de utilidad)

    // Contratos (presupuesto/consumo)
    contract_id: { type: MongoIdRef, ref: "Contract", required: false },
    contract_charge_mode: { type: String, required: false, enum: ["within_contract", "outside_contract", "no_contract"], default: "no_contract" },
    contract_charge_amount: { type: Number, required: false, default: 0 },

    // Metadata
    created: { type: Date, default: new Date() },
    created_by: { type: MongoIdRef, ref: "User" }, // Usuario que creó el registro
    status: { type: String, required: true, enum: ["pending", "accepted", "rejected"], default: "pending" },
    service_status: { type: String, required: true, enum: ["not-started", "started", "finished"], default: "not-started" }
});

// Índices para mejorar el rendimiento de búsquedas
SolicitudSchema.index({ bitacora_id: 1, fecha: -1 });
SolicitudSchema.index({ cliente: 1 });
SolicitudSchema.index({ conductor: 1 });
SolicitudSchema.index({ vehiculo_id: 1 });
SolicitudSchema.index({ status: 1 });
SolicitudSchema.index({ he: 1 });

export default mongoose.model<BitacoraSolicitud>("Solicitud", SolicitudSchema);