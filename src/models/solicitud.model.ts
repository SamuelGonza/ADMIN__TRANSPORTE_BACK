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
    hora_final: { type: String, required: false, default: "" }, // HORA (final) - se completa cuando termina el servicio
    total_horas: { type: Number, required: true }, // Total de horas

    // Cliente y contacto
    cliente: { type: MongoIdRef, ref: "Client", required: true }, // CLIENTE
    contacto: { type: String, required: true }, // CONTACTO
    contacto_phone: { type: String, required: false }, // Número de teléfono del contacto

    // Ruta
    origen: { type: String, required: true }, // ORIGEN
    destino: { type: String, required: true }, // DESTINO
    novedades: { type: String, default: "" }, // NOVEDADES
    origen_location_id: { type: MongoIdRef, ref: "Location", required: false },
    destino_location_id: { type: MongoIdRef, ref: "Location", required: false },

    // Estimación de precio (según contrato/tarifario)
    estimated_km: { type: Number, required: false },
    estimated_hours: { type: Number, required: false },
    pricing_mode: { type: String, required: false, enum: ["por_hora", "por_kilometro", "por_distancia", "tarifa_amva", "por_viaje", "por_trayecto"] },
    pricing_rate: { type: Number, required: false },
    estimated_price: { type: Number, required: false },

    // Vehículo y conductor (pueden ser null si está en estado "sin asignación")
    vehiculo_id: { type: MongoIdRef, ref: "Vehicle", required: false }, // Referencia al vehículo
    placa: { type: String, required: false }, // PLACA
    tipo_vehiculo: { type: String, required: false }, // TIPO DE VEHÍCULO
    n_pasajeros: { type: Number, required: false }, // N° PASAJEROS
    flota: { type: String, required: false }, // FLOTA
    conductor: { type: MongoIdRef, ref: "User", required: false }, // CONDUCTOR
    conductor_phone: { type: String, required: false }, // Teléfono del conductor

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
    // nombre_cuenta_cobro ya no se usa aquí, se maneja en PaymentSection
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
    total_gastos_operacionales: { type: Number, required: false, default: 0 }, // Suma automática de gastos operacionales vinculados
    valor_documento_equivalente: { type: Number, required: false }, // Valor final para documento legal equivalente

    // Contratos (presupuesto/consumo)
    contract_id: { type: MongoIdRef, ref: "Contract", required: false },
    contract_charge_mode: { type: String, required: false, enum: ["within_contract", "outside_contract", "no_contract"], default: "no_contract" },
    contract_charge_amount: { type: Number, required: false, default: 0 },

    // Flujo de contabilidad
    accounting_status: { 
        type: String, 
        required: false, 
        enum: ["no_iniciado", "pendiente_operacional", "operacional_completo", "prefactura_pendiente", "prefactura_aprobada", "listo_para_facturacion", "facturado"],
        default: "no_iniciado"
    },
    prefactura: {
        numero: { type: String, required: false },
        fecha: { type: Date, required: false },
        aprobada: { type: Boolean, required: false, default: false },
        aprobada_por: { type: MongoIdRef, ref: "User", required: false },
        aprobada_fecha: { type: Date, required: false },
        rechazada_por: { type: MongoIdRef, ref: "User", required: false },
        rechazada_fecha: { type: Date, required: false },
        notas: { type: String, required: false },
        // Nuevos campos para envío al cliente
        estado: { type: String, required: false, enum: ["pendiente", "aceptada", "rechazada"], default: "pendiente" },
        enviada_al_cliente: { type: Boolean, required: false, default: false },
        fecha_envio_cliente: { type: Date, required: false },
        enviada_por: { type: MongoIdRef, ref: "User", required: false },
        historial_envios: {
            type: [
                new Schema(
                    {
                        fecha: { type: Date, required: true },
                        estado: { type: String, required: true, enum: ["aceptada", "rechazada"] },
                        enviado_por: { type: MongoIdRef, ref: "User", required: true },
                        notas: { type: String, required: false }
                    },
                    { _id: false }
                )
            ],
            required: false,
            default: []
        }
    },

    // Metadata
    created: { type: Date, default: new Date() },
    created_by: { type: MongoIdRef, ref: "User" }, // Usuario que creó el registro
    last_modified_by: { type: MongoIdRef, ref: "User", required: false }, // Usuario que hizo la última modificación
    status: { type: String, required: true, enum: ["pending", "accepted", "rejected"], default: "pending" },
    service_status: { type: String, required: true, enum: ["pendiente_de_asignacion", "sin_asignacion", "not-started", "started", "finished"], default: "pendiente_de_asignacion" }
});

// Índices para mejorar el rendimiento de búsquedas
SolicitudSchema.index({ bitacora_id: 1, fecha: -1 });
SolicitudSchema.index({ cliente: 1 });
SolicitudSchema.index({ conductor: 1 });
SolicitudSchema.index({ vehiculo_id: 1 });
SolicitudSchema.index({ status: 1 });
SolicitudSchema.index({ he: 1 });

export default mongoose.model<BitacoraSolicitud>("Solicitud", SolicitudSchema);