import { DriverDocuments } from "@/contracts/interfaces/driver_documents.interface";
import { MongoIdRef } from "@/utils/constants";
import mongoose, { Schema } from "mongoose";
import { MediaTypesSchema } from "./vhc_operational.model";

const SstItemSchema: Schema = new Schema(
    {
        entidad: { type: String, required: false },
        cobertura: { type: Date, required: false },
    },
    { _id: false }
);

const IpsExamenMedicoSchema: Schema = new Schema(
    {
        entidad: { type: String, required: false },
        fecha_ultimo_examen: { type: Date, required: false },
        fecha_vencimiento_examen: { type: Date, required: false },
        fecha_vencimiento_recomendaciones: { type: Date, required: false },
        recomendaciones_medicas: { type: String, required: false },
    },
    { _id: false }
);

const InduccionSchema: Schema = new Schema(
    {
        fecha_induccion: { type: Date, required: false },
        fecha_reinduccion: { type: Date, required: false },
    },
    { _id: false }
);

const DriverDocumentsSchema: Schema = new Schema<DriverDocuments>({
    driver_id: {type: MongoIdRef, ref: "User", required: true},
    document: {
        back: {type: MediaTypesSchema, required: false},
        front: {type: MediaTypesSchema, required: false}
    },
    licencia_conduccion: {
        back: {type: MediaTypesSchema, required: false},
        front: {type: MediaTypesSchema, required: false}
    },
    licencia_conduccion_numero: { type: String, required: false },
    licencia_conduccion_categoria: { type: String, required: false, enum: ["A1", "A2", "B1", "B2", "B3", "C1", "C2", "C3"] },
    licencia_conduccion_estado: { type: String, required: false },
    licencia_conduccion_expedicion: { type: Date, required: false },
    licencia_conduccion_vencimiento: { type: Date, required: false },

    // Datos básicos
    lugar_expedicion_documento: { type: String, required: false },
    fecha_nacimiento: { type: Date, required: false },
    lugar_nacimiento: { type: String, required: false },
    estado_civil: { type: String, required: false },
    tipo_sangre: { type: String, required: false, enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] },
    genero: { type: String, required: false, enum: ["M", "F", "Otro"] },
    direccion: { type: String, required: false },
    barrio: { type: String, required: false },
    ciudad: { type: String, required: false },
    telefono: { type: String, required: false },
    telefono_celular: { type: String, required: false },
    email_personal: { type: String, required: false },

    // Bancario
    entidad_bancaria: { type: String, required: false },
    tipo_cuenta: { type: String, required: false, enum: ["ahorros", "corriente", "otro"] },
    cuenta_numero: { type: String, required: false },

    // Laboral
    empresa_contratante: { type: String, required: false },
    tipo_contrato: { type: String, required: false },
    condicion_empresa: { type: String, required: false },
    fecha_vinculacion: { type: Date, required: false },
    cargo_asignado: { type: String, required: false },
    lugar_trabajo: { type: String, required: false },
    proceso_asignado: { type: String, required: false },

    // SST
    sst: {
        eps: { type: SstItemSchema, required: false },
        arl: { type: SstItemSchema, required: false },
        riesgos_profesionales: { type: SstItemSchema, required: false },
        fondo_pensiones: { type: SstItemSchema, required: false },
        caja_compensacion: { type: SstItemSchema, required: false },
    },

    // IPS Examen Médico Ocupacional
    ips_examen_medico: { type: IpsExamenMedicoSchema, required: false },

    // Inducción/Reinducción
    induccion: { type: InduccionSchema, required: false },

    // Firma digital
    firma_digital: { type: MediaTypesSchema, required: false },
})

export default mongoose.model<DriverDocuments>("driver_document", DriverDocumentsSchema)