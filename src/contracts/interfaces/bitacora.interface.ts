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

    // Ruta
    origen: string; // ORIGEN
    destino: string; // DESTINO
    novedades: string; // NOVEDADES

    // Vehículo y conductor
    vehiculo_id: ObjectId; // Referencia al vehículo (permite populate)
    placa: string; // PLACA (guardada también para búsquedas rápidas)
    tipo_vehiculo: VehicleTypes | string; // TIPO DE VEHÍCULO (denormalizado para reportes)
    n_pasajeros: number; // N° PASAJEROS
    flota: VehicleFlota | string; // FLOTA (denormalizado para reportes)
    conductor: ObjectId; // CONDUCTOR (referencia al usuario)
    conductor_phone: string; // Teléfono del conductor (denormalizado)

    // Información financiera - Gastos
    nombre_cuenta_cobro: string; // NOMBRE CUENTA DE COBRO
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

    // Metadata
    created: Date;
    created_by?: ObjectId; // Usuario que creó el registro
    status: "pending" | "accepted" | "rejected" // Estado de aprobación
    service_status: "not-started" | "started" | "finished" // Estado de ejecución del servicio
}
