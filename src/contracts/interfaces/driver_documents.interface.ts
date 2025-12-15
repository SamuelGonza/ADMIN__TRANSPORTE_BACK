import { Document, ObjectId } from "mongoose";
import { MediaTypes } from "../globals";

export type ColombiaLicenseCategory = "A1" | "A2" | "B1" | "B2" | "B3" | "C1" | "C2" | "C3";
export type ColombiaBloodType = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";
export type ColombiaGender = "M" | "F" | "Otro";
export type BankAccountType = "ahorros" | "corriente" | "otro";

export interface DriverDocuments extends Document {
    driver_id: ObjectId;
    document: {
        back: MediaTypes,
        front: MediaTypes
    };
    licencia_conduccion: {
        back: MediaTypes,
        front: MediaTypes
    };

    // Metadatos legales (Colombia)
    licencia_conduccion_numero?: string;
    licencia_conduccion_categoria?: ColombiaLicenseCategory;
    licencia_conduccion_estado?: string;
    licencia_conduccion_expedicion?: Date;
    licencia_conduccion_vencimiento?: Date;

    // Datos básicos (como en la imagen)
    lugar_expedicion_documento?: string;
    fecha_nacimiento?: Date;
    lugar_nacimiento?: string;
    estado_civil?: string;
    tipo_sangre?: ColombiaBloodType;
    genero?: ColombiaGender;
    direccion?: string;
    barrio?: string;
    ciudad?: string;
    telefono?: string;
    telefono_celular?: string;
    email_personal?: string;

    // Información bancaria
    entidad_bancaria?: string;
    tipo_cuenta?: BankAccountType;
    cuenta_numero?: string;

    // Información laboral
    empresa_contratante?: string;
    tipo_contrato?: string;
    condicion_empresa?: string; // Ej: PROPIETARIO
    fecha_vinculacion?: Date;
    cargo_asignado?: string;
    lugar_trabajo?: string;
    proceso_asignado?: string;

    // Coberturas de seguridad y salud en el trabajo (SST)
    sst?: {
        eps?: { entidad?: string; cobertura?: Date };
        arl?: { entidad?: string; cobertura?: Date };
        riesgos_profesionales?: { entidad?: string; cobertura?: Date };
        fondo_pensiones?: { entidad?: string; cobertura?: Date };
        caja_compensacion?: { entidad?: string; cobertura?: Date };
    };

    // Examen médico ocupacional (IPS)
    ips_examen_medico?: {
        entidad?: string;
        fecha_ultimo_examen?: Date;
        fecha_vencimiento_examen?: Date;
        fecha_vencimiento_recomendaciones?: Date;
        recomendaciones_medicas?: string;
    };

    // Inducción / Reinducción
    induccion?: {
        fecha_induccion?: Date;
        fecha_reinduccion?: Date;
    };

    // Firma digital (si aplica)
    firma_digital?: MediaTypes;
}