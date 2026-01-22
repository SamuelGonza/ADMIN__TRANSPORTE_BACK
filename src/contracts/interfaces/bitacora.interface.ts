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
    fecha_final: Date; // FECHA FINAL
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
    observaciones_cliente?: string; // Observaciones del cliente
    origen_location_id?: ObjectId;
    destino_location_id?: ObjectId;

    // Datos del servicio (para cálculos de contrato)
    kilometros_reales?: number; // Kilómetros del viaje - se puede definir en cualquier momento
    
    // DEPRECATED: usar contrato_venta
    estimated_km?: number;
    estimated_hours?: number;
    pricing_mode?: "por_hora" | "por_kilometro" | "por_distancia" | "por_viaje" | "por_trayecto";
    pricing_rate?: number;
    estimated_price?: number;
    
    // Contrato de VENTA (lo que se cobra al cliente) - Coordinador Comercial
    contrato_venta?: {
        contract_id?: ObjectId;           // Referencia al contrato del cliente
        pricing_mode: "por_hora" | "por_kilometro" | "por_distancia" | "por_viaje" | "por_trayecto";
        tarifa: number;                   // Tarifa según el modo ($/hora, $/km, etc.)
        cantidad?: number;                // Cantidad (horas, km) - se puede actualizar en cualquier momento
        valor_calculado?: number;         // Resultado del cálculo (tarifa × cantidad)
    };

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

        // Contrato de COMPRA por vehículo (lo que se paga al vehículo)
        // Se define al momento de asignar el vehículo
        contrato_compra?: {
            tipo_contrato: "fijo" | "ocasional";
            pricing_mode: "por_hora" | "por_kilometro" | "por_distancia" | "por_viaje" | "por_trayecto";
            tarifa: number;                   // Tarifa según el modo ($/hora, $/km, etc.)
            cantidad?: number;                // Cantidad (horas, km) - se puede actualizar en cualquier momento
            valor_calculado?: number;         // Resultado del cálculo (tarifa × cantidad)
        };

        // DEPRECATED: Mantener por compatibilidad
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
    factura_id?: ObjectId; // Referencia a la colección Facturas (si se genera por el sistema)
    preliquidaciones?: ObjectId[]; // Referencias a las preliquidaciones

    // Utilidad
    utilidad: number; // UTILIDAD (valor)
    porcentaje_utilidad: number; // % (porcentaje de utilidad)
    total_gastos_operacionales?: number; // Suma automática de gastos operacionales vinculados
    valor_documento_equivalente?: number; // Valor final para documento legal equivalente

    // Contratos (presupuesto/consumo)
    contract_id?: ObjectId;
    contract_charge_mode?: "within_contract" | "outside_contract" | "no_contract";
    contract_charge_amount?: number;

    // Flujo de contabilidad
    accounting_status?: "no_iniciado" | "pendiente_operacional" | "operacional_completo" | "prefactura_pendiente" | "prefactura_aprobada" | "listo_para_facturacion" | "facturado" | "listo_para_liquidar"; // Estado del flujo de contabilidad
    prefactura?: {
        numero?: string;
        fecha?: Date;
        aprobada?: boolean;
        aprobada_por?: ObjectId;
        aprobada_fecha?: Date;
        rechazada_por?: ObjectId;
        rechazada_fecha?: Date;
        notas?: string;
        // Nuevos campos para envío al cliente
        estado?: "pendiente" | "aceptada" | "rechazada"; // Estado de envío al cliente
        enviada_al_cliente?: boolean; // Si ha sido enviada al cliente
        fecha_envio_cliente?: Date; // Fecha del último envío al cliente
        enviada_por?: ObjectId; // Usuario que envió la prefactura
        historial_envios?: Array<{
            fecha: Date;
            estado: "aceptada" | "rechazada";
            enviado_por: ObjectId;
            notas?: string;
        }>;
    };

    // Metadata y Auditoría
    created: Date;
    created_by?: ObjectId; // Usuario que creó el registro
    last_modified_by?: ObjectId; // Usuario que hizo la última modificación
    
    // Campos de auditoría para rastrear acciones
    approved_by?: ObjectId; // Usuario que aprobó la solicitud
    approved_at?: Date; // Fecha de aprobación
    
    assigned_vehicles_by?: ObjectId; // Usuario que asignó vehículos/conductores
    assigned_vehicles_at?: Date; // Fecha de asignación de vehículos
    
    assigned_costs_by?: ObjectId; // Usuario que asignó valores de costos (valor_cancelado)
    assigned_costs_at?: Date; // Fecha de asignación de costos
    
    assigned_sales_by?: ObjectId; // Usuario que asignó valores de venta (valor_a_facturar)
    assigned_sales_at?: Date; // Fecha de asignación de ventas
    
    uploaded_operationals_by?: ObjectId; // Usuario que subió operacionales
    uploaded_operationals_at?: Date; // Fecha de subida de operacionales
    
    generated_prefactura_by?: ObjectId; // Usuario que generó la prefactura
    generated_prefactura_at?: Date; // Fecha de generación de prefactura
    
    generated_factura_by?: ObjectId; // Usuario que generó la factura
    generated_factura_at?: Date; // Fecha de generación de factura
    
    status: "pending" | "accepted" | "rejected" // Estado de aprobación
    service_status: "pendiente_de_asignacion" | "sin_asignacion" | "not-started" | "started" | "finished" // Estado de ejecución del servicio
}
