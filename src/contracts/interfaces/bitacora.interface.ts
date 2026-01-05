import { Document, ObjectId } from "mongoose";
import { VehicleFlota, VehicleTypes } from "./vehicles.interface";

export interface Bitacora extends Document {
    company_id: ObjectId;
    year: string;
    month: string;
    created: Date;
}

export interface BitacoraSolicitud extends Document {
    bitacora_id: ObjectId;

    // Información básica del servicio
    he: string; // HE (código de servicio)
    empresa: "travel" | "national" | string; // EMPRESA
    fecha: Date; // FECHA
    hora_inicio: string; // HORA (inicio)
    hora_final: string; // HORA (final)
    total_horas: number; // Total de horas (mejor como number para cálculos)

    // Cliente y contacto
    cliente: ObjectId; // CLIENTE (referencia a modelo de clientes)
    contacto: string; // CONTACTO
    contacto_phone?: string; // Número de teléfono del contacto

    // Ruta
    origen: string; // ORIGEN
    destino: string; // DESTINO
    novedades: string; // NOVEDADES
    origen_location_id?: ObjectId;
    destino_location_id?: ObjectId;

    // Estimación de precio (según contrato/tarifario)
    estimated_km?: number;
    estimated_hours?: number;
    pricing_mode?: "por_hora" | "por_kilometro" | "por_distancia" | "tarifa_amva" | "por_viaje" | "por_trayecto";
    pricing_rate?: number;
    estimated_price?: number;

    // Vehículo y conductor (pueden ser null si está en estado "sin asignación")
    vehiculo_id?: ObjectId; // Referencia al vehículo (permite populate)
    placa?: string; // PLACA (guardada también para búsquedas rápidas)
    tipo_vehiculo?: VehicleTypes | string; // TIPO DE VEHÍCULO (denormalizado para reportes)
    n_pasajeros?: number; // N° PASAJEROS
    flota?: VehicleFlota | string; // FLOTA (denormalizado para reportes)
    conductor?: ObjectId; // CONDUCTOR (referencia al usuario)
    conductor_phone?: string; // Teléfono del conductor (denormalizado)

    // Multi-vehículo (cuando un servicio requiere varios buses)
    requested_passengers?: number; // total requerido (ej. 200)
    vehicle_assignments?: Array<{
        vehiculo_id: ObjectId;
        placa: string;
        seats: number;
        assigned_passengers: number;
        conductor_id: ObjectId;
        conductor_phone?: string;

        // "Contrato" por bus (cada bus es una línea independiente de control)
        contract_id?: ObjectId;
        contract_charge_mode?: "within_contract" | "outside_contract" | "no_contract";
        contract_charge_amount?: number;

        // Control contable por bus (opcional)
        accounting?: {
            prefactura?: { numero?: string; fecha?: Date };
            preliquidacion?: { numero?: string; fecha?: Date };
            factura?: { numero?: string; fecha?: Date };
            doc_equivalente?: { numero?: string; fecha?: Date };
            pagos?: Array<{ fecha?: Date; valor?: number; referencia?: string }>;
            notas?: string;
        };
    }>;

    // Información financiera - Gastos
    // nombre_cuenta_cobro ya no se usa aquí, se maneja en PaymentSection
    valor_cancelado: number; // VALOR CANCELADO
    doc_soporte: string; // DOC SOPORTE
    fecha_cancelado: Date; // FECHA CANCELADO
    n_egreso: string; // N° EGRESO

    // Información financiera - Ingresos
    valor_a_facturar: number; // VALOR A FACTURAR
    n_factura: string; // N° FACTURA
    fecha_factura?: Date; // FECHA de factura (si existe en el Excel)

    // Utilidad
    utilidad: number; // UTILIDAD (valor)
    porcentaje_utilidad: number; // % (porcentaje de utilidad)
    total_gastos_operacionales?: number; // Suma automática de gastos operacionales vinculados
    valor_documento_equivalente?: number; // Valor final para documento legal equivalente

    // Contratos (presupuesto/consumo)
    contract_id?: ObjectId;
    contract_charge_mode?: "within_contract" | "outside_contract" | "no_contract";
    contract_charge_amount?: number;

    // Metadata
    created: Date;
    created_by?: ObjectId; // Usuario que creó el registro
    last_modified_by?: ObjectId; // Usuario que hizo la última modificación
    status: "pending" | "accepted" | "rejected" // Estado de aprobación
    service_status: "pendiente_de_asignacion" | "sin_asignacion" | "not-started" | "started" | "finished" // Estado de ejecución del servicio
}
