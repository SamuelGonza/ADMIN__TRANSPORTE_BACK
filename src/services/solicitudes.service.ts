import solicitudModel from '@/models/solicitud.model';
import { VehicleServices } from './vehicles.service';
import { CompanyService } from './company.service';
import { UserService } from './users.service';
import { ClientService } from "./client.service";
import { ResponseError } from '@/utils/errors';
import { BitacoraSolicitud } from '@/contracts/interfaces/bitacora.interface';
import { send_coordinator_new_solicitud, send_client_solicitud_approved, send_client_prefactura } from '@/email/index.email';
import userModel from '@/models/user.model';
import dayjs from 'dayjs';
import { ContractsService } from './contracts.service';
import vehicleModel from '@/models/vehicle.model';
import { LocationsService } from './locations.service';
import contractModel from '@/models/contract.model';
import companyModel from '@/models/company.model';
import vhc_operationalModel from '@/models/vhc_operational.model';
import bitacoraModel from '@/models/bitacora.model';
import mongoose from 'mongoose';
import fs from "fs";
import path from "path";
import { renderHtmlToPdfBuffer } from "@/utils/pdf";
import { PaymentSectionService } from './payment_section.service';
import paymentSectionModel from '@/models/payment_section.model';
import vhc_documentsModel from '@/models/vhc_documents.model';
import driver_documentsModel from '@/models/driver_documents.model';
import axios from 'axios';
import * as XLSX from 'xlsx';

export class SolicitudesService {
    private static ClientService = new ClientService()
    private static UserService = new UserService()
    private static CompanyService = new CompanyService()
    private static VehicleServices = new VehicleServices()
    private static ContractsService = new ContractsService()
    private static LocationsService = new LocationsService()

    private compute_estimated_price({
        pricing_mode,
        pricing_rate,
        estimated_hours,
        estimated_km
    }: {
        pricing_mode?: string;
        pricing_rate?: number;
        estimated_hours?: number;
        estimated_km?: number;
    }) {
        if (!pricing_mode || !pricing_rate) return undefined;
        if (pricing_rate <= 0) return undefined;

        if (pricing_mode === "por_hora") {
            if (!estimated_hours || estimated_hours <= 0) return undefined;
            return estimated_hours * pricing_rate;
        }
        if (pricing_mode === "por_kilometro") {
            if (!estimated_km || estimated_km <= 0) return undefined;
            return estimated_km * pricing_rate;
        }
        if (pricing_mode === "por_distancia" || pricing_mode === "tarifa_amva" || pricing_mode === "por_viaje" || pricing_mode === "por_trayecto") {
            return pricing_rate;
        }
        return undefined;
    }

    private async resolve_locations({
        company_id,
        origen,
        destino
    }: {
        company_id: string;
        origen: string;
        destino: string;
    }) {
        const [o, d] = await Promise.all([
            SolicitudesService.LocationsService.ensure_location({ company_id, name: origen }),
            SolicitudesService.LocationsService.ensure_location({ company_id, name: destino })
        ]);
        return { origen_location_id: (o as any)?._id, destino_location_id: (d as any)?._id };
    }

    /**
     * Genera el siguiente consecutivo HE para una compañía
     * Busca el HE más alto y lo incrementa en 1
     */
    private async generate_next_he(company_id: string, empresa_nombre: string = "HE"): Promise<string> {
        try {
            const company_id_obj = new mongoose.Types.ObjectId(company_id);
            const bitacoras = await bitacoraModel.find({ company_id: company_id_obj }).select('_id').lean();
            const bitacora_ids = bitacoras.map(b => b._id);

            // Determinar prefijo (primeras 3 letras en mayúsculas)
            // Ejemplo: "national" -> "NAT", "travel" -> "TRA"
            let prefix = "HE";
            if (empresa_nombre && empresa_nombre.trim().length >= 3) {
                prefix = empresa_nombre.trim().substring(0, 3).toUpperCase();
            } else if (empresa_nombre) {
                prefix = empresa_nombre.trim().toUpperCase();
            }

            if (bitacora_ids.length === 0) {
                return `${prefix}-1`;
            }

            // Buscar todas las solicitudes de la compañía que coincidan con el patrón del prefijo
            const regex = new RegExp(`^${prefix}-\\d+$`);
            
            const solicitudes = await solicitudModel
                .find({ 
                    bitacora_id: { $in: bitacora_ids },
                    he: { $regex: regex }
                })
                .select('he')
                .lean();

            if (!solicitudes || solicitudes.length === 0) {
                return `${prefix}-1`;
            }

            // Extraer números del HE y encontrar el máximo
            let maxNum = 0;
            for (const solicitud of solicitudes) {
                const heStr = (solicitud as any).he;
                if (heStr && typeof heStr === 'string') {
                    const parts = heStr.split('-');
                    if (parts.length === 2) {
                        const num = parseInt(parts[1], 10);
                        if (!isNaN(num) && num > maxNum) {
                            maxNum = num;
                        }
                    }
                }
            }
            
            return `${prefix}-${maxNum + 1}`;
        } catch (error) {
            console.error("Error al generar HE consecutivo:", error);
            return String(Date.now());
        }
    }

    private resolveTemplatePath(fileName: string) {
        const cwd = process.cwd();
        const distPath = path.join(cwd, "dist", "email", "templates", fileName);
        const srcPath = path.join(cwd, "src", "email", "templates", fileName);
        if (fs.existsSync(distPath)) return distPath;
        return srcPath;
    }

    private replaceVariables(html: string, variables: Record<string, string>): string {
        let result = html;
        Object.keys(variables).forEach((key) => {
            const value = variables[key] || "";
            result = result.replace(new RegExp(`{{${key}}}`, "g"), value);
        });
        return result;
    }

    /**
     * Genera el PDF de manifiesto de pasajeros para un vehículo específico.
     * - Header: empresa, placa, modelo, conductor, fecha expedición
     * - Body: tabla con N filas = pasajeros asignados al vehículo
     * - Footer: firma del conductor
     * - Incluye información del cliente y del servicio
     */
    public async generate_passenger_manifest_pdf({
        solicitud_id,
        vehiculo_id,
        conductor_id,
        assigned_passengers
    }: {
        solicitud_id: string;
        vehiculo_id?: string;
        conductor_id?: string;
        assigned_passengers?: number;
    }): Promise<{ filename: string; buffer: Buffer }> {
        try {
            const solicitud = await solicitudModel.findById(solicitud_id)
                .populate('cliente', 'name contacts phone email')
                .lean();
            if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada");

            // Determinar vehículo y conductor
            let vehicle: any = null;
            let conductor: any = null;
            let assignedPassengers = assigned_passengers;

            if (vehiculo_id && conductor_id && assigned_passengers) {
                // Caso: vehicle_assignments (múltiples vehículos)
                vehicle = await vehicleModel
                    .findById(vehiculo_id)
                    .populate("owner_id.company_id", "company_name document logo")
                    .lean();
                if (!vehicle) throw new ResponseError(404, "Vehículo no encontrado");

                conductor = await userModel
                    .findById(conductor_id)
                    .select("full_name document contact")
                    .lean();
                if (!conductor) throw new ResponseError(404, "Conductor no encontrado");
            } else {
                // Caso: vehículo y conductor individuales (compatibilidad)
            if (!(solicitud as any).vehiculo_id) throw new ResponseError(400, "La solicitud no tiene vehículo asignado");
            if (!(solicitud as any).conductor) throw new ResponseError(400, "La solicitud no tiene conductor asignado");

                vehicle = await vehicleModel
                .findById((solicitud as any).vehiculo_id)
                .populate("owner_id.company_id", "company_name document logo")
                .lean();
            if (!vehicle) throw new ResponseError(404, "Vehículo no encontrado");

                conductor = await userModel
                    .findById((solicitud as any).conductor)
                    .select("full_name document contact")
                    .lean();
                if (!conductor) throw new ResponseError(404, "Conductor no encontrado");

                assignedPassengers = (solicitud as any).n_pasajeros || (vehicle as any).seats || 0;
            }

            // Empresa transportadora: preferir owner_id.company_id; si no, fallback a empresa del cliente
            let company: any = (vehicle as any).owner_id?.company_id || null;
            if (!company) {
                const client = (solicitud as any).cliente;
                if (client && (client as any).company_id) {
                company = await companyModel.findById(String((client as any).company_id)).lean();
                }
            }
            if (!company) throw new ResponseError(404, "No se pudo obtener la empresa transportadora");

            // Información del cliente
            const client = (solicitud as any).cliente;
            const clienteName = client?.name || 'N/A';
            const contactoName = (client?.contacts && Array.isArray(client.contacts) && client.contacts.length > 0)
                ? client.contacts[0].name
                : (solicitud as any).contacto || 'N/A';
            const contactoPhone = (client?.contacts && Array.isArray(client.contacts) && client.contacts.length > 0)
                ? client.contacts[0].phone
                : (solicitud as any).contacto_phone || 'N/A';

            // Generar filas según pasajeros asignados
            const assignedPassengersCount = assignedPassengers || 0;
            if (assignedPassengersCount <= 0) {
                throw new ResponseError(400, "El número de pasajeros asignados debe ser mayor a 0");
            }
            const rowsHtml = Array.from({ length: assignedPassengersCount }, (_, idx) => {
                const i = idx + 1;
                return `<tr>
  <td class="idx">${i}</td>
  <td></td>
  <td></td>
  <td></td>
  <td></td>
</tr>`;
            }).join("\n");

            const fechaExpedicion = dayjs(new Date()).format("DD/MM/YYYY HH:mm");
            const modelo = (vehicle as any).technical_sheet?.modelo ?? "";
            const interno = (vehicle as any).n_numero_interno ?? "";
            const nit = company?.document?.number
                ? `${company.document.number}${company.document.dv ? "-" + company.document.dv : ""}`
                : "";

            // Formatear fechas del servicio
            const fechaInicio = dayjs((solicitud as any).fecha).format('DD/MM/YYYY');
            const fechaFinal = dayjs((solicitud as any).fecha_final).format('DD/MM/YYYY');
            const horaInicio = (solicitud as any).hora_inicio || 'N/A';
            const origen = (solicitud as any).origen || 'N/A';
            const destino = (solicitud as any).destino || 'N/A';

            const htmlTemplate = fs.readFileSync(this.resolveTemplatePath("manifiesto-pasajeros.html"), "utf8");
            const html = this.replaceVariables(htmlTemplate, {
                fecha_expedicion: fechaExpedicion,
                company_name: company.company_name || "",
                company_nit: nit,
                company_logo_url: company.logo?.url || "",
                vehiculo_placa: (vehicle as any).placa || "",
                vehiculo_interno: interno || "",
                vehiculo_modelo: String(modelo),
                assigned_passengers: String(assignedPassengersCount),
                conductor_nombre: conductor.full_name || "",
                conductor_documento: conductor?.document?.number ? String(conductor.document.number) : "",
                conductor_telefono: conductor?.contact?.phone || "",
                cliente_name: clienteName,
                contacto_name: contactoName,
                contacto_phone: contactoPhone,
                fecha_inicio: fechaInicio,
                fecha_final: fechaFinal,
                hora_inicio: horaInicio,
                origen: origen,
                destino: destino,
                rows: rowsHtml,
            });

            const pdfBuffer = await renderHtmlToPdfBuffer(html);
            const safePlaca = String((vehicle as any).placa || "vehiculo").replace(/[^a-zA-Z0-9_-]/g, "");
            const filename = `manifiesto_pasajeros_${safePlaca}_${dayjs().format("YYYYMMDD_HHmm")}.pdf`;

            return { filename, buffer: pdfBuffer };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo generar el PDF del manifiesto");
        }
    }

    //* #========== POST METHODS ==========#

    /**
     * Obtener o crear bitácora del mes/año actual para una compañía
     */
    private async get_or_create_bitacora({
        company_id,
        fecha
    }: {
        company_id: string | mongoose.Types.ObjectId,
        fecha: Date
    }): Promise<mongoose.Types.ObjectId> {
        try {
            // Extraer año y mes de la fecha
            const fecha_obj = dayjs(fecha);
            const year = fecha_obj.format('YYYY');
            const month = fecha_obj.format('MM');

            // Normalizar company_id a ObjectId
            const company_id_obj = typeof company_id === 'string' 
                ? new mongoose.Types.ObjectId(company_id)
                : company_id;

            // Buscar bitácora existente
            let bitacora = await bitacoraModel.findOne({
                company_id: company_id_obj,
                year,
                month
            });

            // Si no existe, crearla
            if (!bitacora) {
                const new_bitacora = await bitacoraModel.create({
                    company_id: company_id_obj,
                    year,
                    month,
                    created: new Date()
                });
                return new_bitacora._id;
            }

            return bitacora._id;
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "Error al obtener o crear la bitácora");
        }
    }

    /**
     * Crear solicitud por parte del CLIENTE
     * Solo proporciona datos básicos del servicio
     * Status: pending (requiere aprobación del coordinador)
     * La bitácora se busca automáticamente según la fecha del servicio
     */
    public async create_solicitud_by_client({
        client_id,
        payload
    }: {
        client_id: string,
        payload: {
            // bitacora_id REMOVIDO - se asigna automáticamente según mes/año actual
            fecha: Date,
            fecha_final: Date, // Fecha final del servicio
            hora_inicio: string,
            origen: string,
            destino: string,
            n_pasajeros: number,
            contacto?: string, // Opcional: nombre del contacto (si no se proporciona, se usa el del cliente)
            contacto_phone?: string, // Opcional: número de teléfono del contacto
            requested_passengers?: number,
            estimated_km?: number,
            estimated_hours?: number,
            observaciones_cliente?: string, // Observaciones exclusivas del cliente
            empresa?: string, // Empresa seleccionada (para el consecutivo HE)
        }
    }) {
        try {
            // Validar fecha y hora
            const fechaServicio = dayjs(payload.fecha);
            const fechaFinalServicio = dayjs(payload.fecha_final);
            const fechaActual = dayjs().startOf('day');
            
            // Validar que la fecha no sea menor al día actual
            if (fechaServicio.isBefore(fechaActual, 'day')) {
                throw new ResponseError(400, "La fecha del servicio no puede ser menor al día actual");
            }

            // Validar que la fecha final no sea menor a la fecha de inicio
            if (fechaFinalServicio.isBefore(fechaServicio, 'day')) {
                throw new ResponseError(400, "La fecha final no puede ser menor a la fecha de inicio");
            }

            // Si la fecha es hoy, validar que la hora de inicio no sea menor a la hora actual
            if (fechaServicio.isSame(fechaActual, 'day')) {
                const horaActual = dayjs();
                const [horas, minutos] = payload.hora_inicio.split(':').map(Number);
                const horaInicioServicio = dayjs().hour(horas).minute(minutos || 0).second(0).millisecond(0);
                
                if (horaInicioServicio.isBefore(horaActual)) {
                    throw new ResponseError(400, "La hora de inicio no puede ser menor a la hora actual");
                }
            }

            // Obtener información del cliente
            const client = await SolicitudesService.ClientService.get_client_by_id({ id: client_id });
            if (!client) throw new ResponseError(404, "Cliente no encontrado");

            // Obtener o crear bitácora automáticamente basada en el MES/AÑO ACTUAL (no la fecha del servicio)
                const client_company_id = typeof client.company_id === 'object' 
                    ? (client.company_id as any)._id || client.company_id
                    : client.company_id;
            
            // Normalizar a string para uso consistente
            const client_company_id_str = String(client_company_id);
            
            // Usar fecha actual para determinar mes/año de la bitácora
            const fechaActualParaBitacora = dayjs().toDate();
            const bitacora_id = await this.get_or_create_bitacora({
                company_id: client_company_id_str,
                fecha: fechaActualParaBitacora
                });

            const loc = await this.resolve_locations({
                company_id: client_company_id_str,
                origen: payload.origen,
                destino: payload.destino
            });

            // Normalizar fecha para evitar problemas de timezone
            // Asegurar que la fecha se guarde como fecha local sin hora
            const fechaNormalizada = dayjs(payload.fecha).startOf('day').toDate();
            const fechaFinalNormalizada = dayjs(payload.fecha_final).startOf('day').toDate();

            // Generar consecutivo HE automáticamente
            const empresa_seleccionada = payload.empresa || "national";
            const next_he = await this.generate_next_he(client_company_id_str, empresa_seleccionada);

            // Crear la solicitud con status pending
            const new_solicitud = await solicitudModel.create({
                bitacora_id: bitacora_id,

                // Datos proporcionados por el cliente
                fecha: fechaNormalizada,
                fecha_final: fechaFinalNormalizada,
                hora_inicio: payload.hora_inicio,
                origen: payload.origen,
                destino: payload.destino,
                origen_location_id: loc.origen_location_id,
                destino_location_id: loc.destino_location_id,
                n_pasajeros: payload.n_pasajeros,
                requested_passengers: payload.requested_passengers,
                estimated_km: payload.estimated_km,
                estimated_hours: payload.estimated_hours,
                observaciones_cliente: payload.observaciones_cliente,

                // Datos del cliente (auto-rellenados, pero el cliente puede cambiar contacto y contacto_phone)
                cliente: client_id,
                contacto: payload.contacto || ((client.contacts && client.contacts.length > 0) ? client.contacts[0].name : client.name),
                contacto_phone: payload.contacto_phone || ((client.contacts && client.contacts.length > 0) ? client.contacts[0].phone : client.phone || ""),

                // Campos vacíos/default que se llenarán después
                he: next_he, // Generado automáticamente
                empresa: empresa_seleccionada,
                hora_final: "",
                total_horas: 0,
                novedades: "",

                // Vehículo y conductor (se asignarán al aceptar)
                // Estos campos son opcionales y se llenarán cuando se asigne vehículo

                // Datos financieros (se llenarán al aceptar)
                valor_cancelado: 0,
                doc_soporte: "",
                n_egreso: "",
                valor_a_facturar: 0,
                n_factura: "",
                utilidad: 0,
                porcentaje_utilidad: 0,

                // Metadata
                created_by: client_id,
                last_modified_by: client_id, // Cliente es quien crea, así que también es quien modifica inicialmente
                status: "pending", // Requiere aprobación
                service_status: "pendiente_de_asignacion" // Estado inicial: pendiente de asignación por coordinadores
            });

            await new_solicitud.save();

            // Enviar notificación a TODOS los coordinadores comerciales y operadores
            try {
                // Obtener SOLO coordinadores comerciales y operadores de la empresa del cliente
                // Usar client_company_id normalizado y convertirlo a ObjectId para la consulta
                const company_id_obj = new mongoose.Types.ObjectId(client_company_id_str);
                const coordinators = await userModel.find({
                    company_id: company_id_obj,
                    role: { $in: ['coordinador_operador', 'coordinador_comercial'] },
                    is_active: true,
                    is_delete: false
                }).select('full_name email').lean();

                // Formatear fecha
                const fecha_formatted = dayjs(payload.fecha).format('DD/MM/YYYY');

                // Enviar email a cada coordinador
                for (const coordinator of coordinators) {
                    await send_coordinator_new_solicitud({
                        coordinator_name: coordinator.full_name,
                        coordinator_email: coordinator.email,
                        client_name: client.name, // Nombre del cliente, no del contacto
                        fecha: fecha_formatted,
                        hora_inicio: payload.hora_inicio,
                        origen: payload.origen,
                        destino: payload.destino,
                        n_pasajeros: payload.n_pasajeros
                    });
                }
            } catch (emailError) {
                console.log("Error al enviar email a coordinadores:", emailError);
            }
        } catch (error) {
            console.log(error);
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo crear la solicitud");
        }
    }

    /**
     * Crear solicitud por parte del COORDINADOR
     * Proporciona todos los datos del servicio
     * Status: accepted (ya aprobado)
     */
    public async create_solicitud_by_coordinator({
        coordinator_id,
        payload
    }: {
        coordinator_id: string,
        payload: {
            bitacora_id: string,
            cliente_id: string,

            // Información básica
            // he REMOVIDO - se genera automáticamente como consecutivo por compañía
            empresa: "travel" | "national" | string,
            fecha: Date,
            fecha_final: Date, // Fecha final del servicio
            hora_inicio: string,
            origen: string,
            destino: string,
            n_pasajeros: number,
            requested_passengers?: number,
            estimated_km?: number,
            estimated_hours?: number,

            // Vehículo y conductor
            placa: string, // Se usa placa en lugar de vehiculo_id (para compatibilidad hacia atrás)
            conductor_id?: string, // Opcional: si no se proporciona, se usa el conductor principal del vehículo (para compatibilidad)

            // NUEVO: Array de vehículos asignados (multi-vehículo)
            vehicle_assignments?: Array<{
                vehiculo_id: string;
                placa: string;
                conductor_id: string;
                assigned_passengers: number;
                contract_id?: string;
                contract_charge_mode?: "within_contract" | "outside_contract" | "no_contract";
                contract_charge_amount?: number;
            }>;

            // Datos financieros (opcionales - el comercial los establecerá después)
            // valor_cancelado, valor_a_facturar, utilidad, porcentaje_utilidad removidos

            // Contrato (opcional) - se aplica a todos los vehículos si vehicle_assignments no especifica contrato individual
            contract_id?: string,
            contract_charge_mode?: "within_contract" | "outside_contract" | "no_contract",
            contract_charge_amount?: number,
            pricing_mode?: "por_hora" | "por_kilometro" | "por_distancia" | "tarifa_amva" | "por_viaje" | "por_trayecto",
        }
    }) {
        try {
            // Validar fecha y hora
            const fechaServicio = dayjs(payload.fecha);
            const fechaFinalServicio = dayjs(payload.fecha_final);
            const fechaActual = dayjs().startOf('day');
            
            // Validar que la fecha no sea menor al día actual
            if (fechaServicio.isBefore(fechaActual, 'day')) {
                throw new ResponseError(400, "La fecha del servicio no puede ser menor al día actual");
            }

            // Validar que la fecha final no sea menor a la fecha de inicio
            if (fechaFinalServicio.isBefore(fechaServicio, 'day')) {
                throw new ResponseError(400, "La fecha final no puede ser menor a la fecha de inicio");
            }

            // Si la fecha es hoy, validar que la hora de inicio no sea menor a la hora actual
            if (fechaServicio.isSame(fechaActual, 'day')) {
                const horaActual = dayjs();
                const [horas, minutos] = payload.hora_inicio.split(':').map(Number);
                const horaInicioServicio = dayjs().hour(horas).minute(minutos || 0).second(0).millisecond(0);
                
                if (horaInicioServicio.isBefore(horaActual)) {
                    throw new ResponseError(400, "La hora de inicio no puede ser menor a la hora actual");
                }
            }

            // Obtener información del cliente
            const client = await SolicitudesService.ClientService.get_client_by_id({ id: payload.cliente_id });
            if (!client) throw new ResponseError(404, "Cliente no encontrado");

            // Extraer y normalizar company_id del cliente
            const client_company_id = typeof client.company_id === 'object' 
                ? (client.company_id as any)._id || client.company_id
                : client.company_id;
            const client_company_id_str = String(client_company_id);

            // Generar consecutivo HE automáticamente
            const next_he = await this.generate_next_he(client_company_id_str, payload.empresa);

            // Normalizar fecha para evitar problemas de timezone
            const fechaNormalizada = dayjs(payload.fecha).startOf('day').toDate();
            const fechaFinalNormalizada = dayjs(payload.fecha_final).startOf('day').toDate();

            const loc = await this.resolve_locations({
                company_id: client_company_id_str,
                origen: payload.origen,
                destino: payload.destino
            });

            // Validar y procesar contrato si está presente
            let contract_validated: any = null;
            let pricing_rate: number | undefined = undefined;
            let pricing_mode: any = payload.pricing_mode;
            
            if (payload.contract_id) {
                // Validar que el contrato existe y pertenece al cliente
                contract_validated = await contractModel.findById(payload.contract_id).lean();
                if (!contract_validated) {
                    throw new ResponseError(404, "Contrato no encontrado");
                }
                
                // Validar que el contrato pertenece al cliente
                if (String(contract_validated.client_id) !== String(payload.cliente_id)) {
                    throw new ResponseError(400, "El contrato no pertenece al cliente especificado");
                }
                
                // Validar que el contrato pertenece a la empresa
                const contract_company_id = typeof contract_validated.company_id === 'object' 
                    ? (contract_validated.company_id as any)._id || contract_validated.company_id
                    : contract_validated.company_id;
                if (String(contract_company_id) !== String(client_company_id_str)) {
                    throw new ResponseError(401, "El contrato no pertenece a la empresa del cliente");
                }
                
                // Validar que el contrato está activo
                if (!contract_validated.is_active) {
                    throw new ResponseError(400, "El contrato está inactivo");
                }
                
                // Si contract_charge_mode es "within_contract", validar disponibilidad del presupuesto
                if (payload.contract_charge_mode === "within_contract") {
                    const contract_amount = payload.contract_charge_amount || 0;
                    const current_consumed = contract_validated.valor_consumido || 0;
                    const budget = contract_validated.valor_presupuesto;
                    
                    // Si hay presupuesto definido, validar que no se exceda
                    if (budget != null && (current_consumed + contract_amount) > budget) {
                        throw new ResponseError(400, `El cargo excedería el presupuesto del contrato. Presupuesto: ${budget}, Consumido: ${current_consumed}, Nuevo cargo: ${contract_amount}`);
                    }
                }
                
                // Obtener tarifas para estimación
                const cobro: any = (contract_validated as any)?.cobro || {};
                if (!pricing_mode) pricing_mode = cobro.modo_default;
                if (pricing_mode && cobro && cobro[pricing_mode] != null) pricing_rate = Number(cobro[pricing_mode]);
            }
            const estimated_price = this.compute_estimated_price({
                pricing_mode,
                pricing_rate,
                estimated_hours: payload.estimated_hours,
                estimated_km: payload.estimated_km
            });

            // Procesar vehicle_assignments si está presente, sino usar comportamiento tradicional
            let vehicle_assignments_processed: any[] = [];
            let primary_vehicle: any = null;
            let primary_conductor: any = null;
            let primary_vehicle_data: any = null;

            if (payload.vehicle_assignments && payload.vehicle_assignments.length > 0) {
                // Procesar múltiples vehículos
                vehicle_assignments_processed = await this.process_vehicle_assignments({
                    vehicle_assignments: payload.vehicle_assignments,
                    company_id: client_company_id_str,
                    requested_passengers: payload.requested_passengers,
                    default_contract_id: payload.contract_id,
                    default_contract_charge_mode: payload.contract_charge_mode,
                    default_contract_charge_amount: payload.contract_charge_amount
                });

                // El primer vehículo es el principal (para compatibilidad)
                if (vehicle_assignments_processed.length > 0) {
                    const first = vehicle_assignments_processed[0];
                    primary_vehicle = await vehicleModel.findById(first.vehiculo_id).lean();
                    primary_conductor = await SolicitudesService.UserService.get_user_by_id({ id: String(first.conductor_id) });
                    primary_vehicle_data = {
                        vehicle: primary_vehicle,
                        conductor: primary_conductor
                    };
                }
            } else {
                // Comportamiento tradicional: un solo vehículo
            const vehicleData = await SolicitudesService.VehicleServices.get_vehicle_by_placa({ 
                placa: payload.placa,
                    company_id: client_company_id_str
            });

            // Determinar conductor: por defecto el principal, o el seleccionado si viene en payload
            const vehicle_main_driver_id = vehicleData.conductor?._id ? String(vehicleData.conductor._id) : "";
            const possible_ids: string[] = Array.isArray((vehicleData.vehicle as any).possible_drivers)
                ? (vehicleData.vehicle as any).possible_drivers.map((d: any) => (d?._id ? String(d._id) : String(d)))
                : [];
            const allowed_driver_ids = new Set<string>([vehicle_main_driver_id, ...possible_ids].filter(Boolean));

            const target_driver_id = payload.conductor_id ? String(payload.conductor_id) : vehicle_main_driver_id;
            if (!target_driver_id) throw new ResponseError(400, "El vehículo no tiene conductor asignado");
            if (!allowed_driver_ids.has(target_driver_id)) {
                throw new ResponseError(400, "El conductor seleccionado no está asociado a este vehículo");
            }

            const conductor = await SolicitudesService.UserService.get_user_by_id({ id: target_driver_id });
            if (!conductor) throw new ResponseError(404, "Conductor no encontrado");

                primary_vehicle = vehicleData.vehicle;
                primary_conductor = conductor;
                primary_vehicle_data = vehicleData;
            }

            if (!primary_vehicle || !primary_conductor) {
                throw new ResponseError(400, "No se pudo determinar el vehículo o conductor principal");
            }

            // Crear la solicitud ya aceptada
            const new_solicitud = await solicitudModel.create({
                bitacora_id: payload.bitacora_id,

                // Información básica del servicio
                he: next_he, // Generado automáticamente
                empresa: payload.empresa,
                fecha: fechaNormalizada,
                fecha_final: fechaFinalNormalizada, // NUEVO
                hora_inicio: payload.hora_inicio,
                origen: payload.origen,
                destino: payload.destino,
                origen_location_id: loc.origen_location_id,
                destino_location_id: loc.destino_location_id,
                // Si hay vehicle_assignments, n_pasajeros debe ser la suma de assigned_passengers
                n_pasajeros: vehicle_assignments_processed.length > 0
                    ? vehicle_assignments_processed.reduce((sum, va) => sum + va.assigned_passengers, 0)
                    : payload.n_pasajeros,
                requested_passengers: payload.requested_passengers,

                estimated_km: payload.estimated_km,
                estimated_hours: payload.estimated_hours,
                pricing_mode,
                pricing_rate,
                estimated_price,

                // Cliente
                cliente: payload.cliente_id,
                contacto: (client.contacts && client.contacts.length > 0) ? client.contacts[0].name : client.name,

                // Campos que se llenarán al finalizar
                hora_final: "",
                total_horas: 0,
                novedades: "",

                // Vehículo y conductor (auto-rellenados desde los modelos)
                // Si hay vehicle_assignments, estos campos se usan para compatibilidad (primer vehículo)
                vehiculo_id: (primary_vehicle as any)._id,
                placa: primary_vehicle.placa,
                tipo_vehiculo: primary_vehicle.type,
                flota: primary_vehicle.flota,
                conductor: (primary_conductor as any)._id,
                conductor_phone: (primary_conductor as any).contact?.phone || "",

                // Vehicle assignments (multi-vehículo)
                vehicle_assignments: vehicle_assignments_processed.length > 0 
                    ? vehicle_assignments_processed 
                    : undefined,

                // Datos financieros (inicializados en 0, el comercial los establecerá después)
                valor_cancelado: 0,
                valor_a_facturar: 0,
                utilidad: 0,
                porcentaje_utilidad: 0,

                // Contrato (si aplica) - solo si no hay vehicle_assignments o si todos usan el mismo contrato
                contract_id: payload.contract_id || undefined,
                contract_charge_mode: payload.contract_charge_mode || "no_contract",
                contract_charge_amount: payload.contract_charge_amount || 0,

                // Campos financieros que se llenarán después
                doc_soporte: "",
                n_egreso: "",
                n_factura: "",

                // Metadata
                created_by: coordinator_id,
                last_modified_by: coordinator_id, // Coordinador es quien crea, así que también es quien modifica inicialmente
                status: "accepted", // Ya aprobado
                service_status: "not-started"
            });

            await new_solicitud.save();

            // Crear sección de pagos automáticamente
            const paymentSectionService = new PaymentSectionService();
            // Construir payment_assignments con información completa de cada vehículo
            const payment_assignments = vehicle_assignments_processed.length > 0
                ? await Promise.all(vehicle_assignments_processed.map(async (va) => {
                    const v = await vehicleModel.findById(va.vehiculo_id).select("flota").lean();
                    return {
                        vehiculo_id: String(va.vehiculo_id),
                        placa: va.placa,
                        conductor_id: String(va.conductor_id),
                        flota: (v as any)?.flota || primary_vehicle.flota
                    };
                }))
                : [{
                    vehiculo_id: String((primary_vehicle as any)._id),
                    placa: primary_vehicle.placa,
                    conductor_id: String((primary_conductor as any)._id),
                    flota: primary_vehicle.flota
                }];

            await paymentSectionService.create_or_update_payment_section({
                solicitud_id: new_solicitud._id.toString(),
                company_id: String(client.company_id),
                vehicle_assignments: payment_assignments,
                created_by: coordinator_id
            });

            // Procesar contratos: cargar al contrato si contract_charge_mode === "within_contract"
            // Si hay vehicle_assignments, procesar cargos individuales por vehículo
            if (vehicle_assignments_processed.length > 0) {
                // Procesar cargos por cada vehículo si tienen contract_charge_mode = "within_contract"
                for (const assignment of vehicle_assignments_processed) {
                    if (assignment.contract_charge_mode === "within_contract") {
                        if (!assignment.contract_id) {
                            throw new ResponseError(400, `contract_id es requerido para vehículo ${assignment.placa} cuando contract_charge_mode = within_contract`);
                        }
                        
                        // Validar contrato del vehículo
                        const vehicle_contract = await contractModel.findById(assignment.contract_id).lean();
                        if (!vehicle_contract) {
                            throw new ResponseError(404, `Contrato ${assignment.contract_id} no encontrado para vehículo ${assignment.placa}`);
                        }
                        if (String(vehicle_contract.client_id) !== String(payload.cliente_id)) {
                            throw new ResponseError(400, `El contrato ${assignment.contract_id} no pertenece al cliente para vehículo ${assignment.placa}`);
                        }
                        if (!vehicle_contract.is_active) {
                            throw new ResponseError(400, `El contrato ${assignment.contract_id} está inactivo para vehículo ${assignment.placa}`);
                        }
                        
                        // Validar disponibilidad del presupuesto
                        const amount = Number(assignment.contract_charge_amount || 0);
                        const current_consumed = vehicle_contract.valor_consumido || 0;
                        const budget = vehicle_contract.valor_presupuesto;
                        if (budget != null && (current_consumed + amount) > budget) {
                            throw new ResponseError(400, `El cargo excedería el presupuesto del contrato para vehículo ${assignment.placa}. Presupuesto: ${budget}, Consumido: ${current_consumed}, Nuevo cargo: ${amount}`);
                        }
                        
                        // Cargar al contrato (incluso si amount es 0, para registrar el consumo del servicio)
                        if (amount > 0) {
                            await SolicitudesService.ContractsService.charge_contract({
                                contract_id: String(assignment.contract_id),
                                company_id: client_company_id_str,
                                amount,
                                solicitud_id: new_solicitud._id.toString(),
                                created_by: coordinator_id,
                                notes: `Cargo automático por solicitud ${new_solicitud.he || new_solicitud._id.toString()} - Vehículo ${assignment.placa}`
                            });
                        }
                    }
                }
            } else if (payload.contract_id && payload.contract_charge_mode === "within_contract") {
                // Comportamiento tradicional: un solo vehículo con contrato
                // El contrato ya fue validado arriba en contract_validated
                
                const amount = payload.contract_charge_amount || 0;

                // Cargar al contrato (incluso si amount es 0, para registrar el consumo del servicio)
                // Nota: charge_contract requiere amount > 0, así que solo cargamos si hay monto
                // Si no hay monto, el consumo se registrará cuando el comercial establezca valor_a_facturar
                if (amount > 0) {
                    await SolicitudesService.ContractsService.charge_contract({
                        contract_id: payload.contract_id,
                        company_id: client_company_id_str,
                        amount,
                        solicitud_id: new_solicitud._id.toString(),
                        created_by: coordinator_id,
                        notes: `Cargo automático por solicitud ${new_solicitud.he || new_solicitud._id.toString()}`
                    });
                }

                // Asegurar que la información del contrato esté guardada en la solicitud
                new_solicitud.contract_id = payload.contract_id as any;
                new_solicitud.contract_charge_mode = "within_contract" as any;
                new_solicitud.contract_charge_amount = amount as any;
                await new_solicitud.save();
            } else if (payload.contract_id) {
                // Si hay contract_id pero contract_charge_mode no es "within_contract", solo guardar la información
                new_solicitud.contract_id = payload.contract_id as any;
                new_solicitud.contract_charge_mode = (payload.contract_charge_mode || "no_contract") as any;
                new_solicitud.contract_charge_amount = (payload.contract_charge_amount || 0) as any;
                await new_solicitud.save();
            }

            // Enviar correos cuando la solicitud está completamente rellenada
            try {
                await this.send_emails_solicitud_complete({
                    solicitud_id: new_solicitud._id.toString()
                });
            } catch (emailError) {
                console.log("Error al enviar correos de solicitud completa:", emailError);
                // No lanzar error, solo loguear
            }
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo crear la solicitud");
        }
    }

    //* #========== PUT METHODS ==========#

    /**
     * Aceptar solicitud pendiente del cliente
     * El coordinador asigna vehículo mediante PLACA y automáticamente se asigna el conductor
     */
    public async accept_solicitud({
        solicitud_id,
        company_id,
        accepted_by,
        payload
    }: {
        solicitud_id: string,
        company_id?: string,
        accepted_by?: string,
            payload: {
            he?: string, // Opcional: si no se proporciona, se usa el existente o se genera uno nuevo
            empresa: "travel" | "national",
            placa?: string, // Opcional si se usa vehicle_assignments
            conductor_id?: string, // Permite elegir conductor del listado del vehículo (para compatibilidad)
            
            // NUEVO: Array de vehículos asignados (multi-vehículo)
            vehicle_assignments?: Array<{
                vehiculo_id: string;
                placa: string;
                conductor_id: string;
                assigned_passengers: number;
                contract_id?: string;
                contract_charge_mode?: "within_contract" | "outside_contract" | "no_contract";
                contract_charge_amount?: number;
            }>;
            
            // Valores financieros removidos - el comercial los establecerá después
            requested_passengers?: number,
            estimated_km?: number,
            estimated_hours?: number,

            // Contrato (opcional) - se aplica a todos los vehículos si vehicle_assignments no especifica contrato individual
            contract_id?: string,
            contract_charge_mode?: "within_contract" | "outside_contract" | "no_contract",
            contract_charge_amount?: number,
            pricing_mode?: "por_hora" | "por_kilometro" | "por_distancia" | "tarifa_amva" | "por_viaje" | "por_trayecto",
        }
    }) {
        try {
            const solicitud = await solicitudModel.findById(solicitud_id);
            if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada");

            if (solicitud.status !== "pending") {
                throw new ResponseError(400, "Solo se pueden aceptar solicitudes pendientes");
            }

            // Obtener company_id del cliente si no se proporciona
            if (!company_id) {
                const client = await SolicitudesService.ClientService.get_client_by_id({ id: String(solicitud.cliente) });
                const client_company_id = typeof client.company_id === 'object' 
                    ? (client.company_id as any)._id || client.company_id
                    : client.company_id;
                company_id = String(client_company_id);
            }

            // Validar y procesar contrato si está presente
            let contract_validated: any = null;
            if (payload.contract_id) {
                // Validar que el contrato existe y pertenece al cliente
                contract_validated = await contractModel.findById(payload.contract_id).lean();
                if (!contract_validated) {
                    throw new ResponseError(404, "Contrato no encontrado");
                }
                
                // Validar que el contrato pertenece al cliente
                if (String(contract_validated.client_id) !== String(solicitud.cliente)) {
                    throw new ResponseError(400, "El contrato no pertenece al cliente de la solicitud");
                }
                
                // Validar que el contrato pertenece a la empresa
                const contract_company_id = typeof contract_validated.company_id === 'object' 
                    ? (contract_validated.company_id as any)._id || contract_validated.company_id
                    : contract_validated.company_id;
                if (String(contract_company_id) !== String(company_id)) {
                    throw new ResponseError(401, "El contrato no pertenece a la empresa");
                }
                
                // Validar que el contrato está activo
                if (!contract_validated.is_active) {
                    throw new ResponseError(400, "El contrato está inactivo");
                }
                
                // Si contract_charge_mode es "within_contract", validar disponibilidad del presupuesto
                if (payload.contract_charge_mode === "within_contract") {
                    const contract_amount = payload.contract_charge_amount || 0;
                    const current_consumed = contract_validated.valor_consumido || 0;
                    const budget = contract_validated.valor_presupuesto;
                    
                    // Si hay presupuesto definido, validar que no se exceda
                    if (budget != null && (current_consumed + contract_amount) > budget) {
                        throw new ResponseError(400, `El cargo excedería el presupuesto del contrato. Presupuesto: ${budget}, Consumido: ${current_consumed}, Nuevo cargo: ${contract_amount}`);
                    }
                }
            }

            // Procesar vehicle_assignments si está presente, sino usar comportamiento tradicional
            let vehicle_assignments_processed: any[] = [];
            let primary_vehicle: any = null;
            let primary_conductor: any = null;
            let primary_vehicle_data: any = null;

            if (payload.vehicle_assignments && payload.vehicle_assignments.length > 0) {
                // Procesar múltiples vehículos
                vehicle_assignments_processed = await this.process_vehicle_assignments({
                    vehicle_assignments: payload.vehicle_assignments,
                    company_id: company_id!,
                    requested_passengers: payload.requested_passengers,
                    default_contract_id: payload.contract_id,
                    default_contract_charge_mode: payload.contract_charge_mode,
                    default_contract_charge_amount: payload.contract_charge_amount
                });

                // El primer vehículo es el principal (para compatibilidad)
                if (vehicle_assignments_processed.length > 0) {
                    const first = vehicle_assignments_processed[0];
                    primary_vehicle = await vehicleModel.findById(first.vehiculo_id).lean();
                    primary_conductor = await SolicitudesService.UserService.get_user_by_id({ id: String(first.conductor_id) });
                    primary_vehicle_data = {
                        vehicle: primary_vehicle,
                        conductor: primary_conductor
                    };
                }
            } else {
                // Comportamiento tradicional: un solo vehículo
                if (!payload.placa) {
                    throw new ResponseError(400, "placa es requerida cuando no se usa vehicle_assignments");
                }
                
            const vehicleData = await SolicitudesService.VehicleServices.get_vehicle_by_placa({ 
                placa: payload.placa,
                company_id 
            });

            // Determinar conductor: por defecto el principal, o el seleccionado si viene en payload
            const vehicle_main_driver_id = vehicleData.conductor?._id ? String(vehicleData.conductor._id) : "";
            const possible_ids: string[] = Array.isArray((vehicleData.vehicle as any).possible_drivers)
                ? (vehicleData.vehicle as any).possible_drivers.map((d: any) => (d?._id ? String(d._id) : String(d)))
                : [];
            const allowed_driver_ids = new Set<string>([vehicle_main_driver_id, ...possible_ids].filter(Boolean));

            const target_driver_id = payload.conductor_id ? String(payload.conductor_id) : vehicle_main_driver_id;
            if (!target_driver_id) throw new ResponseError(400, "El vehículo no tiene conductor asignado");
            if (!allowed_driver_ids.has(target_driver_id)) {
                throw new ResponseError(400, "El conductor seleccionado no está asociado a este vehículo");
            }

            const conductor = await SolicitudesService.UserService.get_user_by_id({ id: target_driver_id });
            if (!conductor) throw new ResponseError(404, "Conductor no encontrado");

                primary_vehicle = vehicleData.vehicle;
                primary_conductor = conductor;
                primary_vehicle_data = vehicleData;
            }

            if (!primary_vehicle || !primary_conductor) {
                throw new ResponseError(400, "No se pudo determinar el vehículo o conductor principal");
            }

            // Actualizar la solicitud
            solicitud.status = "accepted";
            
            // Determinar HE: usar el proporcionado, el existente, o generar uno nuevo
            if (payload.he) {
                solicitud.he = payload.he;
            } else if (solicitud.he) {
                // Usar el HE existente de la solicitud
                // No hacer nada, ya tiene HE
            } else {
                // Generar nuevo HE basado en la empresa
                solicitud.he = await this.generate_next_he(company_id!, payload.empresa);
            }
            
            solicitud.empresa = payload.empresa;

            // Guardar requested_passengers / estimaciones
            (solicitud as any).requested_passengers = payload.requested_passengers;
            (solicitud as any).estimated_km = payload.estimated_km;
            (solicitud as any).estimated_hours = payload.estimated_hours;

            // Resolver locations (usa origen/destino existente en solicitud)
            if (company_id) {
                const loc = await this.resolve_locations({
                    company_id,
                    origen: String((solicitud as any).origen),
                    destino: String((solicitud as any).destino)
                });
                (solicitud as any).origen_location_id = loc.origen_location_id;
                (solicitud as any).destino_location_id = loc.destino_location_id;
            }

            // Asignar vehículo (automático desde la placa o primer vehículo de vehicle_assignments)
            solicitud.vehiculo_id = (primary_vehicle as any)._id as any;
            solicitud.placa = primary_vehicle.placa;
            solicitud.tipo_vehiculo = primary_vehicle.type;
            solicitud.flota = primary_vehicle.flota;

            // Asignar conductor (seleccionado o automático desde el vehículo)
            solicitud.conductor = (primary_conductor as any)._id as any;
            solicitud.conductor_phone = (primary_conductor as any).contact?.phone || "";

            // Vehicle assignments (multi-vehículo)
            if (vehicle_assignments_processed.length > 0) {
                (solicitud as any).vehicle_assignments = vehicle_assignments_processed;
                // Actualizar n_pasajeros con la suma de assigned_passengers
                const totalPassengers = vehicle_assignments_processed.reduce((sum, va) => sum + va.assigned_passengers, 0);
                solicitud.n_pasajeros = totalPassengers;
            }

            // Datos financieros NO se asignan aquí - el comercial los establecerá después
            // Se mantienen en 0 hasta que el comercial los defina

            // Contrato - guardar información si está presente
            if (payload.contract_id) {
            solicitud.contract_id = payload.contract_id as any;
            solicitud.contract_charge_mode = (payload.contract_charge_mode || "no_contract") as any;
                solicitud.contract_charge_amount = (payload.contract_charge_amount || 0) as any;
            }

            // Estimar precio según contrato/tarifario
            let pricing_rate: number | undefined = undefined;
            let pricing_mode: any = payload.pricing_mode;
            if (contract_validated) {
                const cobro: any = (contract_validated as any)?.cobro || {};
                if (!pricing_mode) pricing_mode = cobro.modo_default;
                if (pricing_mode && cobro && cobro[pricing_mode] != null) pricing_rate = Number(cobro[pricing_mode]);
            }
            const estimated_price = this.compute_estimated_price({
                pricing_mode,
                pricing_rate,
                estimated_hours: payload.estimated_hours,
                estimated_km: payload.estimated_km
            });
            (solicitud as any).pricing_mode = pricing_mode;
            (solicitud as any).pricing_rate = pricing_rate;
            (solicitud as any).estimated_price = estimated_price;

            // Cambiar estado de "pendiente_de_asignacion" o "sin_asignacion" a "not-started" cuando se asigna vehículo
            if (solicitud.service_status === "pendiente_de_asignacion" || solicitud.service_status === "sin_asignacion") {
                solicitud.service_status = "not-started";
            }

            // Guardar auditoría
            if (accepted_by) {
                (solicitud as any).approved_by = accepted_by;
                (solicitud as any).approved_at = new Date();
                (solicitud as any).assigned_vehicles_by = accepted_by;
                (solicitud as any).assigned_vehicles_at = new Date();
                (solicitud as any).last_modified_by = accepted_by;
            }

            await solicitud.save();

            // Crear o actualizar sección de pagos automáticamente
            const paymentSectionService = new PaymentSectionService();
            // Construir payment_assignments con información completa de cada vehículo
            const payment_assignments = vehicle_assignments_processed.length > 0
                ? await Promise.all(vehicle_assignments_processed.map(async (va) => {
                    const v = await vehicleModel.findById(va.vehiculo_id).select("flota").lean();
                    return {
                        vehiculo_id: String(va.vehiculo_id),
                        placa: va.placa,
                        conductor_id: String(va.conductor_id),
                        flota: (v as any)?.flota || primary_vehicle.flota
                    };
                }))
                : [{
                    vehiculo_id: String((primary_vehicle as any)._id),
                    placa: primary_vehicle.placa,
                    conductor_id: String((primary_conductor as any)._id),
                    flota: primary_vehicle.flota
                }];

            await paymentSectionService.create_or_update_payment_section({
                solicitud_id: solicitud._id.toString(),
                company_id: company_id!,
                vehicle_assignments: payment_assignments,
                created_by: accepted_by
            });

            // Procesar contratos: cargar al contrato si contract_charge_mode === "within_contract"
            // Si hay vehicle_assignments, procesar cargos individuales por vehículo
            if (vehicle_assignments_processed.length > 0) {
                // Procesar cargos por cada vehículo si tienen contract_charge_mode = "within_contract"
                for (const assignment of vehicle_assignments_processed) {
                    if (assignment.contract_charge_mode === "within_contract") {
                        if (!assignment.contract_id) {
                            throw new ResponseError(400, `contract_id es requerido para vehículo ${assignment.placa} cuando contract_charge_mode = within_contract`);
                        }
                        
                        // Validar contrato del vehículo
                        const vehicle_contract = await contractModel.findById(assignment.contract_id).lean();
                        if (!vehicle_contract) {
                            throw new ResponseError(404, `Contrato ${assignment.contract_id} no encontrado para vehículo ${assignment.placa}`);
                        }
                        if (String(vehicle_contract.client_id) !== String(solicitud.cliente)) {
                            throw new ResponseError(400, `El contrato ${assignment.contract_id} no pertenece al cliente para vehículo ${assignment.placa}`);
                        }
                        if (!vehicle_contract.is_active) {
                            throw new ResponseError(400, `El contrato ${assignment.contract_id} está inactivo para vehículo ${assignment.placa}`);
                        }
                        
                        // Validar disponibilidad del presupuesto
                        const amount = Number(assignment.contract_charge_amount || 0);
                        const current_consumed = vehicle_contract.valor_consumido || 0;
                        const budget = vehicle_contract.valor_presupuesto;
                        if (budget != null && (current_consumed + amount) > budget) {
                            throw new ResponseError(400, `El cargo excedería el presupuesto del contrato para vehículo ${assignment.placa}. Presupuesto: ${budget}, Consumido: ${current_consumed}, Nuevo cargo: ${amount}`);
                        }
                        
                        // Cargar al contrato (incluso si amount es 0, para registrar el consumo del servicio)
                        if (amount > 0) {
                            await SolicitudesService.ContractsService.charge_contract({
                                contract_id: String(assignment.contract_id),
                                company_id: company_id!,
                                amount,
                                solicitud_id: solicitud._id.toString(),
                                created_by: accepted_by || undefined,
                                notes: `Cargo automático por aceptación de solicitud ${solicitud.he || solicitud._id.toString()} - Vehículo ${assignment.placa}`
                            });
                        }
                    }
                }
            } else if (payload.contract_id && payload.contract_charge_mode === "within_contract") {
                // Comportamiento tradicional: un solo vehículo con contrato
                // El contrato ya fue validado arriba en contract_validated
                
                const amount = payload.contract_charge_amount || 0;
                
                // Cargar al contrato (incluso si amount es 0, para registrar el consumo del servicio)
                // Nota: charge_contract requiere amount > 0, así que solo cargamos si hay monto
                // Si no hay monto, el consumo se registrará cuando el comercial establezca valor_a_facturar
                if (amount > 0) {
                    await SolicitudesService.ContractsService.charge_contract({
                        contract_id: payload.contract_id,
                        company_id: company_id!,
                        amount,
                        solicitud_id: solicitud._id.toString(),
                        created_by: accepted_by || undefined,
                        notes: `Cargo automático por aceptación de solicitud ${solicitud.he || solicitud._id.toString()}`
                    });
                }

                // Asegurar que la información del contrato esté guardada en la solicitud
                solicitud.contract_id = payload.contract_id as any;
                solicitud.contract_charge_mode = "within_contract" as any;
                solicitud.contract_charge_amount = amount as any;
                await solicitud.save();
            } else if (payload.contract_id) {
                // Si hay contract_id pero contract_charge_mode no es "within_contract", solo guardar la información
                solicitud.contract_id = payload.contract_id as any;
                solicitud.contract_charge_mode = (payload.contract_charge_mode || "no_contract") as any;
                solicitud.contract_charge_amount = (payload.contract_charge_amount || 0) as any;
                await solicitud.save();
            }

            // Enviar correos cuando la solicitud está completamente rellenada
            try {
                await this.send_emails_solicitud_complete({
                    solicitud_id: solicitud._id.toString()
                });
            } catch (emailError) {
                console.log("Error al enviar correos de solicitud completa:", emailError);
                // No lanzar error, solo loguear
            }

            // Devolver solicitud con información completa del vehículo y conductor
            return {
                message: "Solicitud aceptada exitosamente",
                solicitud,
                vehiculo: primary_vehicle_data.vehicle,
                conductor: primary_conductor,
                propietario: primary_vehicle_data.propietario,
                vehicle_assignments: vehicle_assignments_processed.length > 0 ? vehicle_assignments_processed : undefined
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            // Log del error para debugging
            console.error("Error al aceptar solicitud:", error);
            const errorMessage = error instanceof Error ? error.message : "Error desconocido";
            throw new ResponseError(500, `No se pudo aceptar la solicitud: ${errorMessage}`);
        }
    }

    /**
     * Buscar vehículo por placa para previsualizar información antes de aceptar
     */
    public async preview_vehicle_by_placa({
        placa,
        company_id
    }: {
        placa: string,
        company_id?: string
    }) {
        try {
            const vehicleData = await SolicitudesService.VehicleServices.get_vehicle_by_placa({ 
                placa, 
                company_id 
            });
            return vehicleData;
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo obtener información del vehículo");
        }
    }

    /**
     * Sugerir asignación multi-vehículo para una solicitud
     * Devuelve un "plan temporal" sin guardar (el frontend decide y luego confirma).
     *
     * Estrategia (por defecto): greedy por asientos desc (elige buses más grandes primero).
     * Si se envía preferred_seats, intenta usar buses con ese número de asientos.
     */
    public async suggest_vehicle_allocation({
        solicitud_id,
        company_id,
        requested_passengers,
        preferred_seats,
        vehicle_type
    }: {
        solicitud_id: string;
        company_id?: string;
        requested_passengers: number;
        preferred_seats?: number;
        vehicle_type?: string;
    }) {
        try {
            if (!requested_passengers || requested_passengers <= 0) {
                throw new ResponseError(400, "requested_passengers debe ser mayor a 0");
            }

            const solicitud = await solicitudModel.findById(solicitud_id).lean();
            if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada");

            // Solo sugerir en pending/accepted (no bloquear por status, pero evitar finish)
            if ((solicitud as any).service_status === "finished") {
                throw new ResponseError(400, "No se puede sugerir asignación para un servicio finalizado");
            }

            // Buscar vehículos de la empresa (Company)
            const q: any = {
                $or: [
                    { "owner_id.type": "Company", "owner_id.company_id": company_id },
                ]
            };
            if (vehicle_type) q.type = vehicle_type;

            const vehicles = await vehicleModel
                .find(q)
                .select("_id placa seats type flota driver_id possible_drivers n_numero_interno")
                .populate("driver_id", "full_name contact.phone")
                .populate("possible_drivers", "full_name contact.phone")
                .lean();

            if (!vehicles || vehicles.length === 0) throw new ResponseError(404, "No hay vehículos disponibles para sugerencia");

            // Filtrar por seats preferidos si aplica
            const candidates = preferred_seats
                ? vehicles.filter(v => (v as any).seats === preferred_seats)
                : vehicles;

            const sorted = [...candidates].sort((a: any, b: any) => (b.seats || 0) - (a.seats || 0));
            if (sorted.length === 0) throw new ResponseError(404, "No hay vehículos que cumplan el criterio de asientos");

            const plan: Array<{
                vehiculo: any;
                seats: number;
                assigned_passengers: number;
                // drivers disponibles para elegir
                allowed_drivers: Array<{ _id: string; full_name: string; phone?: string }>;
            }> = [];

            let remaining = requested_passengers;
            for (const v of sorted) {
                if (remaining <= 0) break;
                const seats = Number((v as any).seats || 0);
                if (!seats) continue;

                const assigned = Math.min(seats, remaining);
                const mainDriver = (v as any).driver_id;
                const possible = Array.isArray((v as any).possible_drivers) ? (v as any).possible_drivers : [];
                const drivers = [mainDriver, ...possible]
                    .filter(Boolean)
                    .map((d: any) => ({
                        _id: String(d._id || d),
                        full_name: d.full_name || "",
                        phone: d.contact?.phone
                    }));

                plan.push({
                    vehiculo: {
                        _id: String((v as any)._id),
                        placa: (v as any).placa,
                        n_numero_interno: (v as any).n_numero_interno,
                        seats: (v as any).seats,
                        type: (v as any).type,
                        flota: (v as any).flota
                    },
                    seats,
                    assigned_passengers: assigned,
                    allowed_drivers: drivers
                });

                remaining -= assigned;
            }

            return {
                solicitud_id,
                requested_passengers,
                preferred_seats: preferred_seats || null,
                vehicle_type: vehicle_type || null,
                total_assigned: requested_passengers - remaining,
                remaining,
                plan
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo sugerir la asignación de vehículos");
        }
    }

    /**
     * Buscar vehículos disponibles para una cantidad de pasajeros
     * Devuelve vehículos disponibles y en servicio (con flag)
     * Prioriza vehículos propios > afiliados > externos, luego por capacidad
     */
    public async find_vehicles_for_passengers({
        company_id,
        requested_passengers,
        fecha,
        hora_inicio,
        vehicle_type
    }: {
        company_id: string;
        requested_passengers: number;
        fecha: Date;
        hora_inicio: string;
        vehicle_type?: string;
    }) {
        try {
            if (!requested_passengers || requested_passengers <= 0) {
                throw new ResponseError(400, "requested_passengers debe ser mayor a 0");
            }

            if (!fecha || !hora_inicio) {
                throw new ResponseError(400, "fecha y hora_inicio son requeridos");
            }

            // Función para normalizar IDs
            const normalizeId = (id: any): string | null => {
                if (!id) return null;
                if (typeof id === 'string') return id;
                return String(id._id || id);
            };

            const targetCompanyId = String(company_id);

            // Buscar TODOS los vehículos (sin filtrar por company_id inicialmente)
            // Luego filtraremos según la lógica de flota
            const vehicleQuery: any = {};
            if (vehicle_type) vehicleQuery.type = vehicle_type;

            const allVehicles = await vehicleModel
                .find(vehicleQuery)
                .select("_id placa seats type flota driver_id possible_drivers n_numero_interno owner_id")
                .populate("driver_id", "full_name contact.phone company_id")
                .populate("possible_drivers", "full_name contact.phone company_id")
                .populate("owner_id.user_id", "company_id")
                .lean();

            // Filtrar vehículos según la lógica de flota (propios, afiliados, externos)
            const vehicles = allVehicles.filter((vehicle: any) => {
                // 1. Vehículos propios: owner_id.company_id coincide
                const ownerCompanyId = normalizeId(vehicle.owner_id?.company_id);
                if (ownerCompanyId === targetCompanyId) {
                    return true;
                }

                // 2. Vehículos de usuarios: verificar si el usuario tiene company_id que coincide
                if (vehicle.owner_id?.type === "User" && vehicle.owner_id?.user_id) {
                    const userId = vehicle.owner_id.user_id;
                    // Si el usuario tiene company_id poblado, verificar
                    if (userId.company_id) {
                        const userCompanyId = normalizeId(userId.company_id);
                        if (userCompanyId === targetCompanyId) {
                            return true;
                        }
                    }
                }

                // 3. Vehículos afiliados: verificar que el conductor pertenezca a la compañía
                if (vehicle.flota === "afiliado") {
                    if (vehicle.driver_id) {
                        const driverCompanyId = normalizeId(vehicle.driver_id?.company_id);
                        if (driverCompanyId === targetCompanyId) {
                            return true;
                        }
                    }
                    // Si el vehículo es afiliado pero no tiene conductor o el conductor no tiene company_id,
                    // también verificar si alguno de los possible_drivers tiene el company_id correcto
                    if (vehicle.possible_drivers && Array.isArray(vehicle.possible_drivers) && vehicle.possible_drivers.length > 0) {
                        const hasDriverWithCompany = vehicle.possible_drivers.some((driver: any) => {
                            const driverCompanyId = normalizeId(driver?.company_id);
                            return driverCompanyId === targetCompanyId;
                        });
                        if (hasDriverWithCompany) {
                            return true;
                        }
                    }
                }

                // 4. Vehículos externos: si el conductor pertenece a la compañía
                if (vehicle.flota === "externo") {
                    const driverCompanyId = normalizeId(vehicle.driver_id?.company_id);
                    if (driverCompanyId === targetCompanyId) {
                        return true;
                    }
                }

                return false;
            });

            if (!vehicles || vehicles.length === 0) {
                throw new ResponseError(404, "No hay vehículos disponibles");
            }

            // Convertir fecha a formato para comparación (solo fecha, sin hora)
            // Usar UTC para evitar problemas de timezone
            const fechaComparacion = new Date(fecha);
            fechaComparacion.setUTCHours(0, 0, 0, 0);
            const fechaFinComparacion = new Date(fechaComparacion);
            fechaFinComparacion.setUTCHours(23, 59, 59, 999);

            // Función para convertir hora string a minutos desde medianoche
            const horaAMinutos = (hora: string): number => {
                const [horas, minutos] = hora.split(':').map(Number);
                return horas * 60 + (minutos || 0);
            };

            const horaInicioMinutos = horaAMinutos(hora_inicio);
            // Estimar hora final mínima (asumir al menos 1 hora de servicio)
            // Esto es conservador para detectar conflictos
            const horaFinMinimaEstimada = horaInicioMinutos + 60; // Mínimo 1 hora

            // Verificar disponibilidad de cada vehículo y conductor
            const vehiclesWithAvailability = await Promise.all(
                vehicles.map(async (vehicle: any) => {
                    const vehicleId = normalizeId(vehicle._id);
                    if (!vehicleId) {
                        // Si no se puede normalizar el ID, considerar el vehículo como no disponible
                        return {
                            vehiculo: {
                                _id: String(vehicle._id),
                                placa: vehicle.placa,
                                n_numero_interno: vehicle.n_numero_interno,
                                seats: vehicle.seats,
                                type: vehicle.type,
                                flota: vehicle.flota
                            },
                            seats: Number(vehicle.seats || 0),
                            is_available: false,
                            is_in_service: true,
                            conflicting_service: null,
                            flota_priority: vehicle.flota === "propio" ? 3 : vehicle.flota === "afiliado" ? 2 : 1,
                            driver: null,
                            possible_drivers: []
                        };
                    }
                    
                    // Buscar solicitudes activas para este vehículo en la fecha
                    // Considerar tanto vehiculo_id principal como vehicle_assignments
                    // Incluir solo solicitudes pending o accepted (no rejected)
                    const vehicleObjectId = new mongoose.Types.ObjectId(vehicleId);
                    
                    // Buscar en vehiculo_id principal
                    const solicitudesPorVehiculoPrincipal = await solicitudModel.find({
                        vehiculo_id: vehicleObjectId,
                        fecha: {
                            $gte: fechaComparacion,
                            $lte: fechaFinComparacion
                        },
                        status: { $in: ["pending", "accepted"] },
                        service_status: { $ne: "finished" }
                    }).select("hora_inicio hora_final total_horas fecha vehicle_assignments conductor vehiculo_id status service_status").lean();
                    
                    // Buscar en vehicle_assignments
                    // Hacer una búsqueda más amplia y filtrar manualmente para asegurar que encontremos todas las solicitudes
                    const todasLasSolicitudesEnFecha = await solicitudModel.find({
                        fecha: {
                            $gte: fechaComparacion,
                            $lte: fechaFinComparacion
                        },
                        status: { $in: ["pending", "accepted"] },
                        service_status: { $ne: "finished" }
                    }).select("hora_inicio hora_final total_horas fecha vehicle_assignments conductor vehiculo_id status service_status").lean();
                    
                    // Filtrar manualmente las que tienen este vehículo en vehicle_assignments
                    const solicitudesPorAssignments = todasLasSolicitudesEnFecha.filter((sol: any) => {
                        if (!sol.vehicle_assignments || !Array.isArray(sol.vehicle_assignments)) return false;
                        return sol.vehicle_assignments.some((va: any) => {
                            const vaId = normalizeId(va.vehiculo_id?._id || va.vehiculo_id);
                            return vaId === vehicleId;
                        });
                    });
                    
                    // Debug: Log temporal para verificar qué se está encontrando
                    if (solicitudesPorAssignments.length > 0 || solicitudesPorVehiculoPrincipal.length > 0) {
                        console.log(`[DEBUG] Vehículo ${vehicle.placa} (${vehicleId}):`, {
                            encontradasPorPrincipal: solicitudesPorVehiculoPrincipal.length,
                            encontradasPorAssignments: solicitudesPorAssignments.length,
                            totalEnFecha: todasLasSolicitudesEnFecha.length,
                            fechaBuscada: fecha.toISOString(),
                            fechaComparacion: fechaComparacion.toISOString(),
                            fechaFinComparacion: fechaFinComparacion.toISOString()
                        });
                    }
                    
                    // Combinar y eliminar duplicados
                    const todasLasSolicitudesVehiculo = [...solicitudesPorVehiculoPrincipal, ...solicitudesPorAssignments];
                    const solicitudesActivas = todasLasSolicitudesVehiculo.filter((sol, index, self) => 
                        index === self.findIndex((s) => String(s._id) === String(sol._id))
                    );
                    
                    // Debug adicional: verificar que las fechas estén en el rango correcto
                    if (solicitudesActivas.length > 0) {
                        console.log(`[DEBUG] Solicitudes activas encontradas para ${vehicle.placa}:`, solicitudesActivas.map((s: any) => ({
                            _id: s._id,
                            fecha: s.fecha,
                            hora_inicio: s.hora_inicio,
                            status: s.status,
                            service_status: s.service_status,
                            vehiculo_id: String(s.vehiculo_id),
                            vehicle_assignments: s.vehicle_assignments?.map((va: any) => ({
                                vehiculo_id: String(va.vehiculo_id?._id || va.vehiculo_id),
                                placa: va.placa
                            }))
                        })));
                    }

                    // También buscar por conductor para validar disponibilidad del conductor
                    const conductorIds = [
                        vehicle.driver_id?._id || vehicle.driver_id,
                        ...(vehicle.possible_drivers || []).map((d: any) => d._id || d).filter(Boolean)
                    ]
                    .map(id => normalizeId(id))
                    .filter((id): id is string => id !== null)
                    .map(id => new mongoose.Types.ObjectId(id));

                    const solicitudesConductor = conductorIds.length > 0 ? await solicitudModel.find({
                        $or: [
                            { conductor: { $in: conductorIds } },
                            { "vehicle_assignments.conductor_id": { $in: conductorIds } }
                        ],
                        fecha: {
                            $gte: fechaComparacion,
                            $lte: fechaFinComparacion
                        },
                        status: { $in: ["pending", "accepted"] },
                        service_status: { $ne: "finished" }
                    }).select("hora_inicio hora_final total_horas fecha vehicle_assignments conductor vehiculo_id").lean() : [];

                    // Combinar ambas búsquedas y eliminar duplicados
                    const todasLasSolicitudes = [...solicitudesActivas, ...solicitudesConductor];
                    const solicitudesUnicas = todasLasSolicitudes.filter((sol, index, self) => 
                        index === self.findIndex((s) => String(s._id) === String(sol._id))
                    );

                    let isInService = false;
                    let conflictingService: any = null;
                    let isDriverBusy = false;
                    let conflictingDriverService: any = null;

                    // Verificar si hay solapamiento de horarios para el vehículo
                    for (const solicitud of solicitudesUnicas) {
                        // Verificar si esta solicitud afecta a este vehículo
                        // Normalizar IDs para comparación correcta
                        const solicitudVehiculoId = normalizeId(solicitud.vehiculo_id);
                        const afectaVehiculoPrincipal = solicitudVehiculoId === vehicleId;
                        
                        // Verificar también en vehicle_assignments
                        // vehicle_assignments puede tener vehiculo_id como ObjectId o como objeto poblado
                        const afectaEnAssignments = solicitud.vehicle_assignments && Array.isArray(solicitud.vehicle_assignments) &&
                            solicitud.vehicle_assignments.some((va: any) => {
                                // Puede ser ObjectId directo, objeto poblado con _id, o string
                                const vaVehiculoIdRaw = va.vehiculo_id;
                                const vaVehiculoId = normalizeId(
                                    vaVehiculoIdRaw?._id || vaVehiculoIdRaw
                                );
                                return vaVehiculoId === vehicleId;
                            });
                        
                        const afectaVehiculo = afectaVehiculoPrincipal || afectaEnAssignments;

                        if (!afectaVehiculo) continue;
                        
                        // Debug: Log cuando se encuentra una solicitud que afecta al vehículo
                        console.log(`[DEBUG] Solicitud ${solicitud._id} afecta vehículo ${vehicle.placa}:`, {
                            afectaVehiculoPrincipal,
                            afectaEnAssignments,
                            solicitudFecha: solicitud.fecha,
                            solicitudHoraInicio: solicitud.hora_inicio,
                            solicitudStatus: solicitud.status,
                            solicitudServiceStatus: solicitud.service_status,
                            vehicleAssignments: solicitud.vehicle_assignments?.map((va: any) => ({
                                vehiculo_id: String(va.vehiculo_id?._id || va.vehiculo_id),
                                placa: va.placa
                            }))
                        });

                        const solHoraInicio = horaAMinutos(solicitud.hora_inicio || "00:00");
                        let solHoraFin: number;
                        let horaFinalStr: string;

                        if (solicitud.hora_final && solicitud.hora_final.trim() !== "") {
                            // Si hay hora_final, usarla (servicio ya finalizado)
                            solHoraFin = horaAMinutos(solicitud.hora_final);
                            horaFinalStr = solicitud.hora_final;
                        } else {
                            // Si no hay hora_final, el servicio aún no ha finalizado
                            // Para solicitudes aceptadas o iniciadas, considerar que el vehículo está ocupado
                            // desde la hora de inicio hasta el final del día (23:59)
                            // Esto es conservador y evita conflictos
                            solHoraFin = 24 * 60; // Fin del día (23:59 = 1439 minutos)
                            horaFinalStr = "23:59";
                        }
                        
                        // Debug: Log del cálculo de horarios
                        console.log(`[DEBUG] Cálculo de horarios para solicitud ${solicitud._id}:`, {
                            horaInicio: solicitud.hora_inicio,
                            horaFinal: solicitud.hora_final,
                            totalHoras: solicitud.total_horas,
                            solHoraInicioMinutos: solHoraInicio,
                            solHoraFinMinutos: solHoraFin,
                            horaFinalCalculada: horaFinalStr,
                            horaInicioNuevaMinutos: horaInicioMinutos,
                            horaFinMinimaEstimada: horaFinMinimaEstimada
                        });

                        // Verificar solapamiento completo: 
                        // Dos rangos se solapan si:
                        // - El inicio del nuevo está dentro del existente: nueva_inicio >= existente_inicio && nueva_inicio < existente_fin
                        // - El inicio del existente está dentro del nuevo: existente_inicio >= nueva_inicio && existente_inicio < nueva_fin
                        // - El nuevo empieza antes pero termina después del inicio del existente: nueva_inicio < existente_inicio && nueva_fin > existente_inicio
                        const haySolapamiento = (
                            (horaInicioMinutos >= solHoraInicio && horaInicioMinutos < solHoraFin) ||
                            (solHoraInicio >= horaInicioMinutos && solHoraInicio < horaFinMinimaEstimada) ||
                            (horaInicioMinutos < solHoraInicio && horaFinMinimaEstimada > solHoraInicio)
                        );
                        
                        // Debug: Log del solapamiento
                        console.log(`[DEBUG] Verificación de solapamiento para ${vehicle.placa}:`, {
                            haySolapamiento,
                            nuevaInicio: horaInicioMinutos,
                            nuevaFin: horaFinMinimaEstimada,
                            existenteInicio: solHoraInicio,
                            existenteFin: solHoraFin,
                            condicion1: horaInicioMinutos >= solHoraInicio && horaInicioMinutos < solHoraFin,
                            condicion2: solHoraInicio >= horaInicioMinutos && solHoraInicio < horaFinMinimaEstimada,
                            condicion3: horaInicioMinutos < solHoraInicio && horaFinMinimaEstimada > solHoraInicio
                        });

                        if (haySolapamiento) {
                            isInService = true;
                            conflictingService = {
                                hora_inicio: solicitud.hora_inicio,
                                hora_final: horaFinalStr,
                                fecha: solicitud.fecha
                            };
                            console.log(`[DEBUG] ✅ Vehículo ${vehicle.placa} marcado como EN SERVICIO por solapamiento`);
                            break;
                        }
                    }

                    // Verificar disponibilidad de TODOS los conductores (principal y alternativos)
                    // Función helper para verificar si un conductor está ocupado
                    const verificarConductorOcupado = (conductorId: string | null): boolean => {
                        if (!conductorId) return false;
                        
                        const driverIdNormalized = normalizeId(conductorId);
                        if (!driverIdNormalized) return false;
                        
                        for (const solicitud of solicitudesUnicas) {
                            const solicitudConductorId = normalizeId(solicitud.conductor);
                            // También verificar en vehicle_assignments (puede ser ObjectId o objeto poblado)
                            const solicitudConductoresAsignados = solicitud.vehicle_assignments?.map((va: any) => {
                                const conductorIdRaw = va.conductor_id;
                                return normalizeId(conductorIdRaw?._id || conductorIdRaw);
                            }).filter(Boolean) || [];

                            if (solicitudConductorId === driverIdNormalized || solicitudConductoresAsignados.includes(driverIdNormalized)) {
                                const solHoraInicio = horaAMinutos(solicitud.hora_inicio || "00:00");
                                let solHoraFin: number;

                                if (solicitud.hora_final && solicitud.hora_final.trim() !== "") {
                                    solHoraFin = horaAMinutos(solicitud.hora_final);
                                } else {
                                    // Si no hay hora_final, considerar hasta el final del día
                                    solHoraFin = 24 * 60; // Fin del día
                                }

                                const haySolapamiento = (
                                    (horaInicioMinutos >= solHoraInicio && horaInicioMinutos < solHoraFin) ||
                                    (solHoraInicio >= horaInicioMinutos && solHoraInicio < horaFinMinimaEstimada) ||
                                    (horaInicioMinutos < solHoraInicio && horaFinMinimaEstimada > solHoraInicio)
                                );

                                if (haySolapamiento) {
                                    return true;
                                }
                            }
                        }
                        return false;
                    };
                    
                    // Verificar conductor principal
                    if (vehicle.driver_id && !isInService) {
                        const driverId = normalizeId(vehicle.driver_id._id || vehicle.driver_id);
                        if (driverId && verificarConductorOcupado(driverId)) {
                            isDriverBusy = true;
                            // Buscar la solicitud conflictiva para obtener los detalles
                            for (const solicitud of solicitudesUnicas) {
                                const solicitudConductorId = normalizeId(solicitud.conductor);
                                const solicitudConductoresAsignados = solicitud.vehicle_assignments?.map((va: any) => {
                                    const conductorIdRaw = va.conductor_id;
                                    return normalizeId(conductorIdRaw?._id || conductorIdRaw);
                                }).filter(Boolean) || [];
                                
                                if (solicitudConductorId === driverId || solicitudConductoresAsignados.includes(driverId)) {
                                    const solHoraInicio = horaAMinutos(solicitud.hora_inicio || "00:00");
                                    let horaFinalStr: string;
                                    
                                    if (solicitud.hora_final && solicitud.hora_final.trim() !== "") {
                                        horaFinalStr = solicitud.hora_final;
                                    } else {
                                        horaFinalStr = "23:59";
                                    }
                                    
                                    conflictingDriverService = {
                                        hora_inicio: solicitud.hora_inicio,
                                        hora_final: horaFinalStr,
                                        fecha: solicitud.fecha
                                    };
                                    break;
                                }
                            }
                        }
                    }
                    
                    // Verificar y filtrar possible_drivers que están ocupados
                    const possibleDriversDisponibles = Array.isArray(vehicle.possible_drivers) 
                        ? vehicle.possible_drivers
                            .filter(Boolean)
                            .filter((d: any) => {
                                const driverId = normalizeId(d._id || d);
                                return !verificarConductorOcupado(driverId);
                            })
                            .map((d: any) => ({
                                _id: String(d._id || d),
                                full_name: d.full_name || "",
                                phone: d.contact?.phone || ""
                            }))
                        : [];

                    // El vehículo está disponible solo si no está en servicio Y el conductor no está ocupado
                    const isAvailable = !isInService && !isDriverBusy;

                    // Determinar prioridad de flota (propio > afiliado > externo)
                    const flotaPriority = vehicle.flota === "propio" ? 3 : 
                                         vehicle.flota === "afiliado" ? 2 : 1;

                    return {
                        vehiculo: {
                            _id: String(vehicle._id),
                            placa: vehicle.placa,
                            n_numero_interno: vehicle.n_numero_interno,
                            seats: vehicle.seats,
                            type: vehicle.type,
                            flota: vehicle.flota
                        },
                        seats: Number(vehicle.seats || 0),
                        is_available: isAvailable,
                        is_in_service: isInService || isDriverBusy,
                        conflicting_service: conflictingService || conflictingDriverService,
                        flota_priority: flotaPriority,
                        driver: vehicle.driver_id ? {
                            _id: String((vehicle.driver_id as any)._id || vehicle.driver_id),
                            full_name: (vehicle.driver_id as any).full_name || "",
                            phone: (vehicle.driver_id as any).contact?.phone || "",
                            is_busy: isDriverBusy
                        } : null,
                        possible_drivers: possibleDriversDisponibles
                    };
                })
            );

            // Ordenar: primero por disponibilidad (disponibles primero), luego por flota, luego por capacidad
            vehiclesWithAvailability.sort((a, b) => {
                // Disponibles primero
                if (a.is_available !== b.is_available) {
                    return a.is_available ? -1 : 1;
                }
                // Luego por prioridad de flota (mayor prioridad primero)
                if (a.flota_priority !== b.flota_priority) {
                    return b.flota_priority - a.flota_priority;
                }
                // Finalmente por capacidad (mayor primero)
                return b.seats - a.seats;
            });

            // Separar disponibles y en servicio
            const availableVehicles = vehiclesWithAvailability.filter(v => v.is_available);
            const inServiceVehicles = vehiclesWithAvailability.filter(v => !v.is_available);

            // Calcular distribución optimizada de pasajeros usando solo vehículos disponibles
            // Objetivo: minimizar el número de vehículos necesarios
            const distribution: Array<{
                vehiculo: any;
                seats: number;
                assigned_passengers: number;
                is_available: boolean;
                is_in_service: boolean;
                conflicting_service?: any;
            }> = [];

            let remaining = requested_passengers;

            // Primero, verificar si hay un solo vehículo que pueda cubrir todos los pasajeros
            const singleVehicleSolution = availableVehicles.find(v => v.seats >= requested_passengers);
            
            if (singleVehicleSolution) {
                // Si hay un vehículo que puede cubrir todos los pasajeros, usarlo
                distribution.push({
                    vehiculo: singleVehicleSolution.vehiculo,
                    seats: singleVehicleSolution.seats,
                    assigned_passengers: requested_passengers,
                    is_available: true,
                    is_in_service: false
                });
                remaining = 0;
            } else {
                // Si no hay un solo vehículo, optimizar para usar el menor número posible
                // Ordenar vehículos por capacidad descendente para priorizar los más grandes
                const sortedVehicles = [...availableVehicles].sort((a, b) => {
                    // Primero por prioridad de flota (mayor primero)
                    if (a.flota_priority !== b.flota_priority) {
                        return b.flota_priority - a.flota_priority;
                    }
                    // Luego por capacidad (mayor primero)
                    return b.seats - a.seats;
                });
                
                // Algoritmo voraz optimizado: usar el menor número de vehículos posible
                for (const vehicle of sortedVehicles) {
                    if (remaining <= 0) break;
                    if (vehicle.seats <= 0) continue;

                    // Si este vehículo puede cubrir todos los pasajeros restantes, usarlo y terminar
                    if (vehicle.seats >= remaining) {
                        distribution.push({
                            vehiculo: vehicle.vehiculo,
                            seats: vehicle.seats,
                            assigned_passengers: remaining,
                            is_available: true,
                            is_in_service: false
                        });
                        remaining = 0;
                        break;
                    } else {
                        // Este vehículo puede ayudar parcialmente
                        // Solo agregarlo si realmente contribuye a la solución
                        const assigned = Math.min(vehicle.seats, remaining);
                        distribution.push({
                            vehiculo: vehicle.vehiculo,
                            seats: vehicle.seats,
                            assigned_passengers: assigned,
                            is_available: true,
                            is_in_service: false
                        });
                        remaining -= assigned;
                    }
                }
            }

            return {
                requested_passengers,
                total_available_seats: availableVehicles.reduce((sum, v) => sum + v.seats, 0),
                total_vehicles_needed: distribution.length,
                remaining_passengers: remaining,
                can_fulfill: remaining === 0,
                distribution,
                available_vehicles: availableVehicles.map(v => ({
                    ...v,
                    assigned_passengers: 0 // No asignados aún
                })),
                in_service_vehicles: inServiceVehicles.map(v => ({
                    vehiculo: v.vehiculo,
                    seats: v.seats,
                    is_available: false,
                    is_in_service: true,
                    conflicting_service: v.conflicting_service,
                    message: v.driver?.is_busy 
                        ? `El conductor ${v.driver.full_name} está ocupado el ${new Date(v.conflicting_service?.fecha || fecha).toLocaleDateString('es-ES')} de ${v.conflicting_service?.hora_inicio} a ${v.conflicting_service?.hora_final}. Puedes seleccionar otro conductor o una fecha u hora posterior.`
                        : `Este vehículo está en servicio el ${new Date(v.conflicting_service?.fecha || fecha).toLocaleDateString('es-ES')} de ${v.conflicting_service?.hora_inicio} a ${v.conflicting_service?.hora_final}. Puedes seleccionarlo para una fecha u hora posterior.`,
                    driver: v.driver,
                    possible_drivers: v.possible_drivers
                }))
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudieron buscar vehículos disponibles");
        }
    }

    /**
     * Helper: Procesar vehicle_assignments del payload
     * Valida y construye el array de vehicle_assignments con toda la información necesaria
     */
    private async process_vehicle_assignments({
        vehicle_assignments,
        company_id,
        requested_passengers,
        default_contract_id,
        default_contract_charge_mode,
        default_contract_charge_amount
    }: {
        vehicle_assignments?: Array<{
            vehiculo_id: string;
            placa: string;
            conductor_id: string;
            assigned_passengers: number;
            contract_id?: string;
            contract_charge_mode?: "within_contract" | "outside_contract" | "no_contract";
            contract_charge_amount?: number;
        }>;
        company_id: string;
        requested_passengers?: number;
        default_contract_id?: string;
        default_contract_charge_mode?: "within_contract" | "outside_contract" | "no_contract";
        default_contract_charge_amount?: number;
    }): Promise<Array<{
        vehiculo_id: any;
        placa: string;
        seats: number;
        assigned_passengers: number;
        conductor_id: any;
        conductor_phone: string;
        contract_id?: any;
        contract_charge_mode: "within_contract" | "outside_contract" | "no_contract";
        contract_charge_amount: number;
        accounting: any;
    }>> {
        if (!vehicle_assignments || vehicle_assignments.length === 0) {
            return [];
        }

        // Validar que la suma de assigned_passengers coincida con requested_passengers si está presente
        const totalAssigned = vehicle_assignments.reduce((sum, a) => sum + Number(a.assigned_passengers || 0), 0);
        if (requested_passengers && totalAssigned !== requested_passengers) {
            throw new ResponseError(400, `La suma de assigned_passengers (${totalAssigned}) debe ser igual a requested_passengers (${requested_passengers})`);
        }
        
        // Validar que todos los vehículos tengan IDs válidos
        for (const assignment of vehicle_assignments) {
            if (!assignment.vehiculo_id || !mongoose.Types.ObjectId.isValid(assignment.vehiculo_id)) {
                throw new ResponseError(400, `vehiculo_id inválido: ${assignment.vehiculo_id}`);
            }
            if (!assignment.conductor_id || !mongoose.Types.ObjectId.isValid(assignment.conductor_id)) {
                throw new ResponseError(400, `conductor_id inválido: ${assignment.conductor_id}`);
            }
            if (!assignment.assigned_passengers || assignment.assigned_passengers <= 0) {
                throw new ResponseError(400, `assigned_passengers debe ser mayor a 0 para vehículo ${assignment.placa || assignment.vehiculo_id}`);
            }
        }

        // Cargar todos los vehículos de una vez
        const vehicleIds = [...new Set(vehicle_assignments.map(a => a.vehiculo_id))];
        const vehicles = await vehicleModel
            .find({
                _id: { $in: vehicleIds.map(id => new mongoose.Types.ObjectId(id)) }
            })
            .select("_id placa seats driver_id possible_drivers type flota")
            .populate("driver_id", "full_name contact.phone")
            .populate("possible_drivers", "full_name contact.phone")
            .lean();

        if (vehicles.length !== vehicleIds.length) {
            throw new ResponseError(400, "Uno o más vehículos no existen");
        }

        const vehicleMap = new Map<string, any>(vehicles.map(v => [String((v as any)._id), v]));

        // Procesar cada asignación
        const finalAssignments: any[] = [];
        for (const assignment of vehicle_assignments) {
            const vehicle = vehicleMap.get(String(assignment.vehiculo_id));
            if (!vehicle) {
                throw new ResponseError(400, `Vehículo ${assignment.vehiculo_id} no encontrado`);
            }

            // Validar capacidad
            const seats = Number((vehicle as any).seats || 0);
            const assigned = Number(assignment.assigned_passengers || 0);
            if (assigned <= 0) {
                throw new ResponseError(400, `assigned_passengers debe ser mayor a 0 para vehículo ${vehicle.placa}`);
            }
            if (seats > 0 && assigned > seats) {
                throw new ResponseError(400, `assigned_passengers (${assigned}) excede la capacidad (${seats}) del vehículo ${vehicle.placa}`);
            }

            // Validar conductor
            const mainDriverId = (vehicle as any).driver_id?._id 
                ? String((vehicle as any).driver_id._id) 
                : String((vehicle as any).driver_id || "");
            const possibleIds = Array.isArray((vehicle as any).possible_drivers)
                ? (vehicle as any).possible_drivers.map((d: any) => (d?._id ? String(d._id) : String(d)))
                : [];
            const allowedDriverIds = new Set<string>([mainDriverId, ...possibleIds].filter(Boolean));

            if (!allowedDriverIds.has(String(assignment.conductor_id))) {
                throw new ResponseError(400, `El conductor ${assignment.conductor_id} no está asociado al vehículo ${vehicle.placa}`);
            }

            // Obtener información del conductor
            const conductor = await SolicitudesService.UserService.get_user_by_id({ id: String(assignment.conductor_id) });
            if (!conductor) {
                throw new ResponseError(404, `Conductor ${assignment.conductor_id} no encontrado`);
            }

            // Construir asignación final
            finalAssignments.push({
                vehiculo_id: vehicle._id,
                placa: vehicle.placa,
                seats: seats,
                assigned_passengers: assigned,
                conductor_id: new mongoose.Types.ObjectId(assignment.conductor_id),
                conductor_phone: (conductor as any).contact?.phone || "",
                contract_id: assignment.contract_id 
                    ? new mongoose.Types.ObjectId(assignment.contract_id)
                    : (default_contract_id ? new mongoose.Types.ObjectId(default_contract_id) : undefined),
                contract_charge_mode: assignment.contract_charge_mode || default_contract_charge_mode || "no_contract",
                contract_charge_amount: assignment.contract_charge_amount || default_contract_charge_amount || 0,
                accounting: {
                    pagos: []
                }
            });
        }

        return finalAssignments;
    }

    /**
     * Confirmar asignación multi-vehículo (persistir en la solicitud)
     * Valida:
     * - suma de assigned_passengers >= requested_passengers
     * - cada conductor pertenece al vehículo (driver principal o possible_drivers)
     */
    public async assign_multiple_vehicles({
        solicitud_id,
        company_id,
        assigned_by,
        requested_passengers,
        assignments
    }: {
        solicitud_id: string;
        company_id?: string;
        assigned_by?: string;
        requested_passengers: number;
        assignments: Array<{
            vehiculo_id: string;
            conductor_id: string;
            assigned_passengers: number;
            contract_id?: string;
            contract_charge_mode?: "within_contract" | "outside_contract" | "no_contract";
            contract_charge_amount?: number;
        }>;
    }) {
        try {
            const solicitud = await solicitudModel.findById(solicitud_id);
            if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada");
            if ((solicitud as any).service_status === "finished") throw new ResponseError(400, "No se puede asignar vehículos a un servicio finalizado");

            if (!requested_passengers || requested_passengers <= 0) throw new ResponseError(400, "requested_passengers debe ser mayor a 0");
            if (!assignments || assignments.length === 0) throw new ResponseError(400, "assignments es requerido");

            const total = assignments.reduce((sum, a) => sum + Number(a.assigned_passengers || 0), 0);
            if (total < requested_passengers) throw new ResponseError(400, "La suma de assigned_passengers no cubre requested_passengers");

            // Cargar vehículos y validar pertenecen a la empresa
            const vehicleIds = [...new Set(assignments.map(a => a.vehiculo_id))];
            const vehicles = await vehicleModel
                .find({
                    _id: { $in: vehicleIds },
                    $or: [
                        { "owner_id.type": "Company", "owner_id.company_id": company_id },
                    ]
                })
                .select("_id placa seats driver_id possible_drivers")
                .populate("driver_id", "full_name contact.phone")
                .populate("possible_drivers", "full_name contact.phone")
                .lean();

            if (vehicles.length !== vehicleIds.length) throw new ResponseError(400, "Uno o más vehículos no pertenecen a la empresa o no existen");

            const vehicleMap = new Map<string, any>(vehicles.map(v => [String((v as any)._id), v]));

            const finalAssignments: any[] = [];
            for (const a of assignments) {
                const v = vehicleMap.get(String(a.vehiculo_id));
                if (!v) throw new ResponseError(400, "Vehículo inválido en assignments");

                const seats = Number((v as any).seats || 0);
                const assigned = Number(a.assigned_passengers || 0);
                if (!assigned || assigned <= 0) throw new ResponseError(400, "assigned_passengers debe ser mayor a 0");
                if (seats && assigned > seats) throw new ResponseError(400, `assigned_passengers excede cupos del vehículo ${v.placa}`);

                const mainDriverId = (v as any).driver_id?._id ? String((v as any).driver_id._id) : String((v as any).driver_id);
                const possibleIds = Array.isArray((v as any).possible_drivers)
                    ? (v as any).possible_drivers.map((d: any) => (d?._id ? String(d._id) : String(d)))
                    : [];
                const allowed = new Set<string>([mainDriverId, ...possibleIds].filter(Boolean));
                if (!allowed.has(String(a.conductor_id))) throw new ResponseError(400, `El conductor no está asociado al vehículo ${v.placa}`);

                const conductor = await SolicitudesService.UserService.get_user_by_id({ id: String(a.conductor_id) });
                finalAssignments.push({
                    vehiculo_id: v._id,
                    placa: v.placa,
                    seats,
                    assigned_passengers: assigned,
                    conductor_id: a.conductor_id,
                    conductor_phone: (conductor as any).contact?.phone || "",

                    contract_id: a.contract_id || undefined,
                    contract_charge_mode: a.contract_charge_mode || "no_contract",
                    contract_charge_amount: a.contract_charge_amount || 0,
                    accounting: {
                        pagos: []
                    }
                });
            }

            (solicitud as any).requested_passengers = requested_passengers;
            (solicitud as any).vehicle_assignments = finalAssignments;

            // Mantener compatibilidad: setear "principal" con el primer ítem
            const first = finalAssignments[0];
            if (first) {
                (solicitud as any).vehiculo_id = first.vehiculo_id;
                (solicitud as any).placa = first.placa;
                (solicitud as any).n_pasajeros = first.assigned_passengers;
                (solicitud as any).conductor = first.conductor_id;
                (solicitud as any).conductor_phone = first.conductor_phone || "";
            }

            // metadata (opcional)
            if (assigned_by) (solicitud as any).created_by = (solicitud as any).created_by || assigned_by;

            await solicitud.save();

            // Si hay cargos dentro de contrato por bus, aplicarlos ahora
            for (const a of finalAssignments) {
                if (a.contract_charge_mode === "within_contract") {
                    if (!a.contract_id) throw new ResponseError(400, "contract_id es requerido cuando contract_charge_mode = within_contract");
                    const amount = Number(a.contract_charge_amount || 0);
                    if (!amount || amount <= 0) throw new ResponseError(400, "contract_charge_amount debe ser > 0 para cargos dentro de contrato");

                    await SolicitudesService.ContractsService.charge_contract({
                        contract_id: String(a.contract_id),
                        company_id,
                        amount,
                        solicitud_id: solicitud._id.toString(),
                        created_by: assigned_by || undefined,
                        notes: `Cargo por bus ${a.placa} (asignación múltiple)`
                    });
                }
            }

            return solicitud.toObject();
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo confirmar la asignación multi-vehículo");
        }
    }

    /**
     * Actualiza el bloque contable de un bus asignado dentro de la solicitud (por vehiculo_id)
     * Valida que existan prefactura y preliquidación antes de permitir facturar
     */
    public async update_assignment_accounting({
        solicitud_id,
        vehiculo_id,
        payload
    }: {
        solicitud_id: string;
        vehiculo_id: string;
        payload: any;
    }) {
        try {
            const solicitud = await solicitudModel.findById(solicitud_id);
            if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada");

            const assignments: any[] = (solicitud as any).vehicle_assignments || [];
            const idx = assignments.findIndex(a => String(a.vehiculo_id) === String(vehiculo_id));
            if (idx === -1) throw new ResponseError(404, "No se encontró el bus asignado en la solicitud");

            const target = assignments[idx];
            target.accounting = target.accounting || { pagos: [] };

            // Validar prefactura y preliquidación antes de permitir facturar
            if (payload.factura !== undefined && payload.factura.numero) {
                // Verificar que existan prefactura y preliquidación
                const tienePrefactura = target.accounting.prefactura && target.accounting.prefactura.numero;
                const tienePreliquidacion = target.accounting.preliquidacion && target.accounting.preliquidacion.numero;
                
                if (!tienePrefactura) {
                    throw new ResponseError(400, "No se puede facturar sin prefactura. Debe crear la prefactura primero.");
                }
                if (!tienePreliquidacion) {
                    throw new ResponseError(400, "No se puede facturar sin preliquidación. Debe crear la preliquidación primero.");
                }
            }

            // shallow merge por secciones
            if (payload.prefactura !== undefined) target.accounting.prefactura = payload.prefactura;
            if (payload.preliquidacion !== undefined) target.accounting.preliquidacion = payload.preliquidacion;
            if (payload.factura !== undefined) target.accounting.factura = payload.factura;
            if (payload.doc_equivalente !== undefined) target.accounting.doc_equivalente = payload.doc_equivalente;
            if (payload.pagos !== undefined) target.accounting.pagos = payload.pagos;
            if (payload.notas !== undefined) target.accounting.notas = payload.notas;

            (solicitud as any).vehicle_assignments = assignments;
            await solicitud.save();

            return solicitud.toObject();
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo actualizar la contabilidad del bus");
        }
    }

    /**
     * Rechazar solicitud pendiente del cliente
     */
    public async reject_solicitud({
        solicitud_id,
    }: {
        solicitud_id: string,
    }) {
        try {
            const solicitud = await solicitudModel.findById(solicitud_id);
            if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada");

            if (solicitud.status !== "pending") {
                throw new ResponseError(400, "Solo se pueden rechazar solicitudes pendientes");
            }

            solicitud.status = "rejected";
            await solicitud.save();

            return {
                message: "Solicitud rechazada",
                solicitud
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo rechazar la solicitud");
        }
    }

    /**
     * Iniciar servicio
     * Cambia el service_status a "started"
     * Solo el coordinador operador puede iniciar el servicio
     */
    public async start_service({
        solicitud_id,
        user_role,
        user_id
    }: {
        solicitud_id: string,
        user_role?: string,
        user_id?: string
    }) {
        try {
            const solicitud = await solicitudModel.findById(solicitud_id);
            if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada");

            // Validar que solo coordinador operador puede iniciar el servicio
            if (user_role && user_role !== "coordinador_operador" && user_role !== "admin" && user_role !== "superadmon") {
                throw new ResponseError(403, "Solo el coordinador operador puede iniciar el servicio");
            }

            if (solicitud.status !== "accepted") {
                throw new ResponseError(400, "Solo se pueden iniciar solicitudes aceptadas");
            }

            if (solicitud.service_status !== "not-started" && solicitud.service_status !== "pendiente_de_asignacion") {
                throw new ResponseError(400, "El servicio ya fue iniciado o no está en estado válido para iniciar");
            }

            solicitud.service_status = "started";
            
            // Guardar quién inició el servicio
            if (user_id) {
                (solicitud as any).last_modified_by = user_id;
            }
            
            await solicitud.save();

            return {
                message: "Servicio iniciado exitosamente",
                solicitud
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo iniciar el servicio");
        }
    }

    /**
     * Finalizar servicio
     * El conductor completa hora_final, total_horas y novedades
     */
    public async finish_service({
        solicitud_id,
        payload
    }: {
        solicitud_id: string,
        payload: {
            hora_final: string,
            novedades?: string
        }
    }) {
        try {
            const solicitud = await solicitudModel.findById(solicitud_id);
            if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada");

            if (solicitud.service_status !== "started") {
                throw new ResponseError(400, "El servicio debe estar iniciado para poder finalizarlo");
            }

            // Calcular total de horas considerando fecha y fecha_final
            const total_horas = this.calculate_hours(
                solicitud.fecha,
                solicitud.hora_inicio,
                solicitud.fecha_final,
                payload.hora_final
            );

            solicitud.hora_final = payload.hora_final;
            solicitud.total_horas = total_horas;
            solicitud.novedades = payload.novedades || "";
            solicitud.service_status = "finished";

            // Si ya tiene venta y costo definidos y no tiene estado de contabilidad, marcar como lista
            if (solicitud.valor_cancelado > 0 && solicitud.valor_a_facturar > 0) {
                const currentStatus = (solicitud as any).accounting_status;
                if (!currentStatus || currentStatus === "no_iniciado") {
                    (solicitud as any).accounting_status = "pendiente_operacional";
                }
            }

            await solicitud.save();

            // Recalcular liquidación automáticamente al finalizar el servicio
            await this.calcular_liquidacion({ solicitud_id });

            return {
                message: "Servicio finalizado exitosamente",
                solicitud
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo finalizar el servicio");
        }
    }

    /**
     * Calcular liquidación automática
     * Fórmula: Total Servicios Realizados - Gastos = Total a Pagar
     * Calcula: utilidad = valor_a_facturar - valor_cancelado - total_gastos_operacionales
     * Actualiza las cuentas de cobro en la sección de pagos
     */
    public async calcular_liquidacion({
        solicitud_id
    }: {
        solicitud_id: string
    }) {
        try {
            const solicitud = await solicitudModel.findById(solicitud_id);
            if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada");

            // Obtener todos los gastos operacionales vinculados a esta solicitud
            const gastos = await vhc_operationalModel.find({ solicitud_id }).lean();

            // Calcular total de gastos operacionales
            const total_gastos_operacionales = gastos.reduce((sum, gasto) => {
                const billsTotal = (gasto.bills || []).reduce((bSum: number, bill: any) => bSum + (bill.value || 0), 0);
                return sum + billsTotal;
            }, 0);

            // Calcular utilidad: Total Servicios - Gastos Cancelados - Gastos Operacionales
            const total_gastos = (solicitud.valor_cancelado || 0) + total_gastos_operacionales;
            const utilidad = (solicitud.valor_a_facturar || 0) - total_gastos;
            const porcentaje_utilidad = solicitud.valor_a_facturar > 0 
                ? (utilidad / solicitud.valor_a_facturar) * 100 
                : 0;

            // Actualizar campos
            solicitud.total_gastos_operacionales = total_gastos_operacionales;
            solicitud.utilidad = utilidad;
            solicitud.porcentaje_utilidad = porcentaje_utilidad;
            
            // Si no hay valor_documento_equivalente, usar utilidad como valor por defecto
            if (!solicitud.valor_documento_equivalente) {
                solicitud.valor_documento_equivalente = utilidad;
            }

            await solicitud.save();

            // Actualizar sección de pagos con los nuevos valores
            const paymentSectionService = new PaymentSectionService();
            
            // Obtener vehículos asignados a la solicitud
            const vehicleIds: string[] = [];
            if (solicitud.vehiculo_id) {
                vehicleIds.push(String(solicitud.vehiculo_id));
            }
            if (solicitud.vehicle_assignments && solicitud.vehicle_assignments.length > 0) {
                solicitud.vehicle_assignments.forEach((va: any) => {
                    if (va.vehiculo_id && !vehicleIds.includes(String(va.vehiculo_id))) {
                        vehicleIds.push(String(va.vehiculo_id));
                    }
                });
            }

            // Actualizar cada cuenta de cobro con los gastos operacionales
            for (const vehicleId of vehicleIds) {
                // Obtener gastos operacionales específicos de este vehículo
                const gastosVehiculo = gastos.filter((g: any) => String(g.vehicle_id) === vehicleId);
                const totalGastosVehiculo = gastosVehiculo.reduce((sum, gasto) => {
                    const billsTotal = (gasto.bills || []).reduce((bSum: number, bill: any) => bSum + (bill.value || 0), 0);
                    return sum + billsTotal;
                }, 0);

                // Calcular valor base (valor a pagar al propietario)
                // Por ahora usamos valor_cancelado dividido entre vehículos, pero esto debería venir del contrato o cálculo específico
                const valorBasePorVehiculo = vehicleIds.length > 0 ? (solicitud.valor_cancelado || 0) / vehicleIds.length : 0;

                await paymentSectionService.update_cuenta_cobro_values({
                    solicitud_id,
                    vehiculo_id: vehicleId,
                    valor_base: valorBasePorVehiculo,
                    gastos_operacionales: totalGastosVehiculo,
                    gastos_preoperacionales: 0 // Por ahora 0, se puede implementar después
                });
            }

            return {
                message: "Liquidación calculada exitosamente",
                data: {
                    valor_a_facturar: solicitud.valor_a_facturar,
                    valor_cancelado: solicitud.valor_cancelado,
                    total_gastos_operacionales,
                    total_gastos,
                    utilidad,
                    porcentaje_utilidad,
                    valor_documento_equivalente: solicitud.valor_documento_equivalente
                }
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo calcular la liquidación");
        }
    }

    /**
     * Establecer valores de venta (solo coordinador comercial)
     * El coordinador comercial establece valor_a_facturar (valor de venta)
     * Automáticamente recalcula utilidad si ya hay costos establecidos
     */
    public async set_financial_values_by_comercial({
        solicitud_id,
        payload,
        comercial_id
    }: {
        solicitud_id: string,
        comercial_id: string,
        payload: {
            valor_a_facturar: number,  // Valor a facturar al cliente (venta)
        }
    }) {
        try {
            const solicitud = await solicitudModel.findById(solicitud_id);
            if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada");

            // Actualizar valor de venta
            solicitud.valor_a_facturar = payload.valor_a_facturar;

            // Guardar auditoría
            (solicitud as any).assigned_sales_by = comercial_id;
            (solicitud as any).assigned_sales_at = new Date();
            (solicitud as any).last_modified_by = comercial_id;

            // Calcular utilidad automáticamente si ya hay costos establecidos
            const total_gastos = (solicitud.total_gastos_operacionales || 0);
            const valor_cancelado = solicitud.valor_cancelado || 0;
            const utilidad = payload.valor_a_facturar - valor_cancelado - total_gastos;
            const porcentaje_utilidad = payload.valor_a_facturar > 0 
                ? (utilidad / payload.valor_a_facturar) * 100 
                : 0;

            solicitud.utilidad = utilidad;
            solicitud.porcentaje_utilidad = porcentaje_utilidad;

            await solicitud.save();

            // Si hay contrato y está en modo "within_contract", cargar al contrato
            if (solicitud.contract_charge_mode === "within_contract" && solicitud.contract_id) {
                // Si aún no se ha cargado al contrato (contract_charge_amount es 0), cargarlo ahora
                if (!solicitud.contract_charge_amount || solicitud.contract_charge_amount === 0) {
                    const client_doc = await SolicitudesService.ClientService.get_client_by_id({ id: String(solicitud.cliente) });
                    await SolicitudesService.ContractsService.charge_contract({
                        contract_id: String(solicitud.contract_id),
                        company_id: String(client_doc.company_id),
                        amount: payload.valor_a_facturar,
                        solicitud_id: solicitud._id.toString(),
                        created_by: comercial_id,
                        notes: `Cargo automático por establecimiento de valores financieros - Solicitud ${solicitud.he || solicitud._id.toString()}`
                    });

                    solicitud.contract_charge_amount = payload.valor_a_facturar as any;
                    await solicitud.save();
                }
            }

            // Recalcular liquidación para actualizar PaymentSection
            await this.calcular_liquidacion({ solicitud_id });

            // Si ya hay costos definidos, marcar como lista para contabilidad (no requiere que el servicio esté finalizado)
            if (solicitud.valor_cancelado > 0 && solicitud.valor_a_facturar > 0) {
                // Solo actualizar si no tiene un estado más avanzado
                const currentStatus = (solicitud as any).accounting_status;
                if (!currentStatus || currentStatus === "no_iniciado") {
                    (solicitud as any).accounting_status = "pendiente_operacional";
                }
            }

            await solicitud.save();

            return {
                message: "Valores de venta establecidos exitosamente",
                solicitud: solicitud.toObject()
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudieron establecer los valores de venta");
        }
    }

    /**
     * Establecer valores de costos (solo coordinador operador)
     * El coordinador operador establece valor_cancelado (costos)
     * Automáticamente recalcula utilidad si ya hay valores de venta establecidos
     */
    public async set_costs_by_operador({
        solicitud_id,
        payload,
        operador_id
    }: {
        solicitud_id: string,
        operador_id: string,
        payload: {
            valor_cancelado: number,    // Valor a pagar al transportador (costos)
        }
    }) {
        try {
            const solicitud = await solicitudModel.findById(solicitud_id);
            if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada");

            // Actualizar valor de costos
            solicitud.valor_cancelado = payload.valor_cancelado;

            // Guardar auditoría
            (solicitud as any).assigned_costs_by = operador_id;
            (solicitud as any).assigned_costs_at = new Date();
            (solicitud as any).last_modified_by = operador_id;

            // Calcular utilidad automáticamente si ya hay valores de venta establecidos
            const total_gastos = (solicitud.total_gastos_operacionales || 0);
            const valor_a_facturar = solicitud.valor_a_facturar || 0;
            const utilidad = valor_a_facturar - payload.valor_cancelado - total_gastos;
            const porcentaje_utilidad = valor_a_facturar > 0 
                ? (utilidad / valor_a_facturar) * 100 
                : 0;

            solicitud.utilidad = utilidad;
            solicitud.porcentaje_utilidad = porcentaje_utilidad;

            // Guardar quién hizo la última modificación
            (solicitud as any).last_modified_by = operador_id;

            await solicitud.save();

            // Recalcular liquidación para actualizar PaymentSection
            await this.calcular_liquidacion({ solicitud_id });

            // Si ya hay venta definida, marcar como lista para contabilidad (no requiere que el servicio esté finalizado)
            if (solicitud.valor_cancelado > 0 && solicitud.valor_a_facturar > 0) {
                // Solo actualizar si no tiene un estado más avanzado
                const currentStatus = (solicitud as any).accounting_status;
                if (!currentStatus || currentStatus === "no_iniciado") {
                    (solicitud as any).accounting_status = "pendiente_operacional";
                }
            }

            await solicitud.save();

            return {
                message: "Valores de costos establecidos exitosamente",
                solicitud: solicitud.toObject()
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudieron establecer los valores de costos");
        }
    }

    /**
     * Actualizar datos financieros
     * Para ir completando información durante el proceso
     * Automáticamente recalcula la liquidación si se actualizan valores financieros
     * Valida que existan prefactura y preliquidación antes de permitir facturar
     */
    public async update_financial_data({
        solicitud_id,
        payload
    }: {
        solicitud_id: string,
        payload: {
            doc_soporte?: string,
            fecha_cancelado?: Date,
            n_egreso?: string,
            n_factura?: string,
            fecha_factura?: Date,
            valor_documento_equivalente?: number,
        }
    }) {
        try {
            const solicitud = await solicitudModel.findById(solicitud_id);
            if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada");

            // Validar prefactura y preliquidación antes de permitir facturar
            if (payload.n_factura !== undefined && payload.n_factura) {
                // Verificar que existan prefactura y preliquidación en todos los vehículos asignados
                const assignments: any[] = (solicitud as any).vehicle_assignments || [];
                let tieneTodosLosDocumentos = true;
                const vehiculosSinDocumentos: string[] = [];

                if (assignments.length > 0) {
                    // Si hay vehicle_assignments, verificar cada uno
                    for (const assignment of assignments) {
                        const accounting = assignment.accounting || {};
                        const tienePrefactura = accounting.prefactura && accounting.prefactura.numero;
                        const tienePreliquidacion = accounting.preliquidacion && accounting.preliquidacion.numero;
                        
                        if (!tienePrefactura || !tienePreliquidacion) {
                            tieneTodosLosDocumentos = false;
                            vehiculosSinDocumentos.push(assignment.placa || String(assignment.vehiculo_id));
                        }
                    }
                } else {
                    // Si no hay vehicle_assignments, verificar si hay un vehículo único
                    // En este caso, no podemos validar prefactura/preliquidación a nivel de solicitud
                    // porque no están almacenados allí. Se asume que se validará en update_assignment_accounting
                    // Por ahora, permitimos facturar si no hay vehicle_assignments (compatibilidad hacia atrás)
                }

                if (!tieneTodosLosDocumentos && assignments.length > 0) {
                    throw new ResponseError(400, 
                        `No se puede facturar sin prefactura y preliquidación. Vehículos pendientes: ${vehiculosSinDocumentos.join(", ")}`
                    );
                }
            }

            // Actualizar solo los campos proporcionados
            if (payload.doc_soporte !== undefined) solicitud.doc_soporte = payload.doc_soporte;
            if (payload.fecha_cancelado !== undefined) solicitud.fecha_cancelado = payload.fecha_cancelado;
            if (payload.n_egreso !== undefined) solicitud.n_egreso = payload.n_egreso;
            if (payload.n_factura !== undefined) solicitud.n_factura = payload.n_factura;
            if (payload.fecha_factura !== undefined) solicitud.fecha_factura = payload.fecha_factura;
            if (payload.valor_documento_equivalente !== undefined) solicitud.valor_documento_equivalente = payload.valor_documento_equivalente;

            await solicitud.save();

            // Recalcular liquidación automáticamente después de actualizar datos financieros
            await this.calcular_liquidacion({ solicitud_id });

            return {
                message: "Datos financieros actualizados exitosamente",
                solicitud
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudieron actualizar los datos financieros");
        }
    }

    //* #========== GET METHODS ==========#

    /**
     * Obtener solicitud por ID con populate
     * Oculta utilidades si el usuario es coordinador
     */
    public async get_solicitud_by_id({ id, user_role }: { id: string, user_role?: string }) {
        try {
            const solicitud = await solicitudModel
                .findById(id)
                .populate('cliente', 'name email contacts phone')
                .populate('vehiculo_id', 'placa type flota seats')
                .populate('conductor', 'name phone email')
                .populate('created_by', 'name email')
                .populate('vehicle_assignments.vehiculo_id', 'placa type flota seats')
                .populate('vehicle_assignments.conductor_id', 'name phone email')
                .lean();

            if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada");

            const sol = solicitud as any;

            // Transformar: si vehicle_assignments está vacío pero hay datos individuales, crear vehicle_assignments
            if ((!sol.vehicle_assignments || sol.vehicle_assignments.length === 0) && sol.vehiculo_id) {
                // Crear vehicle_assignments desde los campos individuales
                sol.vehicle_assignments = [{
                    vehiculo_id: sol.vehiculo_id,
                    placa: sol.placa || (sol.vehiculo_id?.placa),
                    seats: (sol.vehiculo_id as any)?.seats || sol.n_pasajeros || 0,
                    assigned_passengers: sol.n_pasajeros || 0,
                    conductor_id: sol.conductor || null,
                    conductor_phone: sol.conductor_phone || (sol.conductor?.phone) || "",
                    contract_id: sol.contract_id || null,
                    contract_charge_mode: sol.contract_charge_mode || "no_contract",
                    contract_charge_amount: sol.contract_charge_amount || 0,
                    accounting: sol.vehicle_assignments?.[0]?.accounting || {}
                }];
            }

            // Calcular valor_cancelado desde PaymentSection si existe
            // Solo si el usuario puede ver costos (no coordinador_comercial)
            if (user_role !== "coordinador_comercial") {
                const paymentSection = await paymentSectionModel.findOne({ solicitud_id: id }).lean();
                if (paymentSection) {
                    // Calcular valor_cancelado como total_valor_base de la PaymentSection
                    sol.valor_cancelado = paymentSection.total_valor_base || 0;
                } else {
                    // Si no existe PaymentSection, mantener el valor actual o establecer 0
                    sol.valor_cancelado = sol.valor_cancelado || 0;
                }
            }

            // Aplicar permisos de visualización según el rol
            if (user_role === "coordinador_comercial") {
                // Coordinador comercial: no ve costos
                delete sol.valor_cancelado;
                delete sol.doc_soporte;
                delete sol.fecha_cancelado;
                delete sol.n_egreso;
            } else if (user_role === "coordinador_operador") {
                // Coordinador operador: no ve valores de venta
                delete sol.valor_a_facturar;
                delete sol.n_factura;
                delete sol.fecha_factura;
            }

            // Populizar IDs de prefactura
            await this.populate_prefactura_ids(solicitud);

            return solicitud;
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo obtener la solicitud");
        }
    }

    /**
     * Obtener todas las solicitudes con filtros y paginación
     * Oculta utilidades si el usuario es coordinador
     */
    public async get_all_solicitudes({
        filters,
        page = 1,
        limit = 10,
        user_role
    }: {
        filters: {
            bitacora_id?: string,
            cliente_id?: string,
            conductor_id?: string,
            vehiculo_id?: string,
            status?: "pending" | "accepted" | "rejected",
            service_status?: "pendiente_de_asignacion" | "not-started" | "started" | "finished" | "sin_asignacion",
            empresa?: "travel" | "national",
            fecha_inicio?: Date,
            fecha_fin?: Date,
        },
        page?: number,
        limit?: number,
        user_role?: string
    }) {
        try {
            const query: any = {};

            if (filters.bitacora_id) query.bitacora_id = filters.bitacora_id;
            if (filters.cliente_id) query.cliente = filters.cliente_id;
            if (filters.conductor_id) query.conductor = filters.conductor_id;
            if (filters.vehiculo_id) query.vehiculo_id = filters.vehiculo_id;
            if (filters.status) query.status = filters.status;
            if (filters.service_status) query.service_status = filters.service_status;
            if (filters.empresa) query.empresa = filters.empresa;

            // Filtro por rango de fechas
            if (filters.fecha_inicio || filters.fecha_fin) {
                query.fecha = {};
                if (filters.fecha_inicio) query.fecha.$gte = filters.fecha_inicio;
                if (filters.fecha_fin) query.fecha.$lte = filters.fecha_fin;
            }

            const skip = (page - 1) * limit;

            const solicitudes = await solicitudModel
                .find(query)
                .populate('cliente', 'name email contacts phone')
                .populate('vehiculo_id', 'placa type flota seats')
                .populate('conductor', 'full_name contact email')
                .populate('vehicle_assignments.vehiculo_id', 'placa type flota seats')
                .populate('vehicle_assignments.conductor_id', 'full_name contact email')
                .sort({ created: -1 })
                .skip(skip)
                .limit(limit)
                .lean();

            // Obtener todas las PaymentSections para las solicitudes de una vez (solo si el usuario puede ver costos)
            const paymentSectionsMap = new Map<string, number>();
            if (user_role !== "coordinador_comercial") {
                const solicitudIds = solicitudes.map((s: any) => s._id.toString());
                const paymentSections = await paymentSectionModel.find({
                    solicitud_id: { $in: solicitudIds }
                }).select('solicitud_id total_valor_base').lean();
                
                paymentSections.forEach((ps: any) => {
                    paymentSectionsMap.set(ps.solicitud_id.toString(), ps.total_valor_base || 0);
                });
            }

            // Transformar solicitudes: si vehicle_assignments está vacío pero hay datos individuales, crear vehicle_assignments
            for (const solicitud of solicitudes) {
                const sol = solicitud as any;
                
                // Calcular valor_cancelado desde PaymentSection si existe
                if (user_role !== "coordinador_comercial") {
                    const valorCancelado = paymentSectionsMap.get(sol._id.toString());
                    if (valorCancelado !== undefined) {
                        sol.valor_cancelado = valorCancelado;
                    } else {
                        // Si no existe PaymentSection, mantener el valor actual o establecer 0
                        sol.valor_cancelado = sol.valor_cancelado || 0;
                    }
                }
                
                // Si vehicle_assignments está vacío o no existe, pero hay datos en campos individuales
                if ((!sol.vehicle_assignments || sol.vehicle_assignments.length === 0) && sol.vehiculo_id) {
                    // Crear vehicle_assignments desde los campos individuales
                    sol.vehicle_assignments = [{
                        vehiculo_id: sol.vehiculo_id,
                        placa: sol.placa || (sol.vehiculo_id?.placa),
                        seats: (sol.vehiculo_id as any)?.seats || sol.n_pasajeros || 0,
                        assigned_passengers: sol.n_pasajeros || 0,
                        conductor_id: sol.conductor ? {
                            _id: sol.conductor._id || sol.conductor,
                            full_name: sol.conductor.full_name || sol.conductor.name || "",
                            email: sol.conductor.email || "",
                            phone: sol.conductor.contact?.phone || sol.conductor.phone || sol.conductor_phone || ""
                        } : null,
                        contract_id: sol.contract_id || null,
                        contract_charge_mode: sol.contract_charge_mode || "no_contract",
                        contract_charge_amount: sol.contract_charge_amount || 0,
                        accounting: sol.vehicle_assignments?.[0]?.accounting || {}
                    }];
                    
                    // Eliminar campos duplicados del nivel superior después de crear vehicle_assignments
                    delete sol.placa;
                    delete sol.flota;
                    delete sol.conductor;
                    delete sol.conductor_phone;
                    delete sol.vehiculo_id;
                    delete sol.tipo_vehiculo;
                } else if (sol.vehicle_assignments && sol.vehicle_assignments.length > 0) {
                    // Asegurar que los campos populados estén correctamente estructurados
                    for (const assignment of sol.vehicle_assignments) {
                        // Eliminar conductor_phone duplicado si existe
                        delete assignment.conductor_phone;
                        if (assignment.vehiculo_id && typeof assignment.vehiculo_id === 'object') {
                            // Ya está populado, no hacer nada
                        } else if (assignment.vehiculo_id) {
                            // Si es solo un ID, mantenerlo (ya se populó arriba)
                        }
                        if (assignment.conductor_id && typeof assignment.conductor_id === 'object') {
                            // Asegurar que el conductor tenga full_name correctamente estructurado
                            if (!assignment.conductor_id.full_name && assignment.conductor_id.name) {
                                assignment.conductor_id.full_name = assignment.conductor_id.name;
                            }
                            // Asegurar que phone esté presente en conductor_id (extraer de contact.phone)
                            if (!assignment.conductor_id.phone) {
                                if (assignment.conductor_id.contact?.phone) {
                                    assignment.conductor_id.phone = assignment.conductor_id.contact.phone;
                                } else if (assignment.conductor_phone) {
                                    assignment.conductor_id.phone = assignment.conductor_phone;
                                }
                            }
                            // Eliminar conductor_phone duplicado
                            delete assignment.conductor_phone;
                        }
                    }
                    
                    // Eliminar campos duplicados del nivel superior cuando hay vehicle_assignments
                    delete sol.placa;
                    delete sol.flota;
                    delete sol.conductor;
                    delete sol.conductor_phone;
                    delete sol.vehiculo_id;
                    delete sol.tipo_vehiculo;
                }
            }

            // Aplicar permisos de visualización según el rol
            if (user_role === "coordinador_comercial") {
                // Coordinador comercial: no ve costos
                solicitudes.forEach((solicitud: any) => {
                    delete solicitud.valor_cancelado;
                    delete solicitud.doc_soporte;
                    delete solicitud.fecha_cancelado;
                    delete solicitud.n_egreso;
                });
            } else if (user_role === "coordinador_operador") {
                // Coordinador operador: no ve valores de venta
                solicitudes.forEach((solicitud: any) => {
                    delete solicitud.valor_a_facturar;
                    delete solicitud.n_factura;
                    delete solicitud.fecha_factura;
                });
            }

            // Populizar IDs de prefactura para todas las solicitudes
            for (let i = 0; i < solicitudes.length; i++) {
                await this.populate_prefactura_ids(solicitudes[i]);
            }

            const total = await solicitudModel.countDocuments(query);

            return {
                solicitudes,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudieron obtener las solicitudes");
        }
    }

    /**
     * Obtener solicitudes asignadas a un conductor
     * El conductor solo ve solicitudes donde está asignado
     */
    public async get_my_solicitudes({
        conductor_id,
        filters,
        page = 1,
        limit = 10
    }: {
        conductor_id: string,
        filters?: {
            status?: "pending" | "accepted" | "rejected",
            service_status?: "not-started" | "started" | "finished",
            fecha_inicio?: Date,
            fecha_fin?: Date,
        },
        page?: number,
        limit?: number
    }) {
        try {
            const query: any = {
                conductor: conductor_id,
                status: "accepted" // Solo solicitudes aceptadas (que tienen conductor asignado)
            };

            if (filters?.service_status) query.service_status = filters.service_status;

            // Filtro por rango de fechas
            if (filters?.fecha_inicio || filters?.fecha_fin) {
                query.fecha = {};
                if (filters.fecha_inicio) query.fecha.$gte = filters.fecha_inicio;
                if (filters.fecha_fin) query.fecha.$lte = filters.fecha_fin;
            }

            const skip = (page - 1) * limit;

            const solicitudes = await solicitudModel
                .find(query)
                .populate('cliente', 'name email contacts phone')
                .populate('vehiculo_id', 'placa type flota seats name')
                .sort({ fecha: -1, hora_inicio: -1 })
                .skip(skip)
                .limit(limit)
                .lean();

            const total = await solicitudModel.countDocuments(query);

            return {
                solicitudes,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudieron obtener las solicitudes del conductor");
        }
    }

    /**
     * Obtener detalle de una solicitud asignada al conductor
     * Verifica que el conductor esté asignado a la solicitud
     */
    public async get_my_solicitud_by_id({
        conductor_id,
        solicitud_id
    }: {
        conductor_id: string,
        solicitud_id: string
    }) {
        try {
            const solicitud = await solicitudModel
                .findOne({ 
                    _id: solicitud_id, 
                    conductor: conductor_id,
                    status: "accepted"
                })
                .populate('cliente', 'name email contacts phone')
                .populate('vehiculo_id', 'placa type flota seats name description')
                .lean();

            if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada o no tienes acceso");

            return solicitud;
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo obtener la solicitud");
        }
    }

    /**
     * Obtener solicitudes del cliente autenticado
     * El cliente ve todas sus solicitudes (pendientes, aceptadas, rechazadas)
     */
    public async get_client_solicitudes({
        client_id,
        filters,
        page = 1,
        limit = 10
    }: {
        client_id: string,
        filters?: {
            status?: "pending" | "accepted" | "rejected",
            service_status?: "not-started" | "started" | "finished",
            fecha_inicio?: Date,
            fecha_fin?: Date,
        },
        page?: number,
        limit?: number
    }) {
        try {
            const query: any = {
                cliente: client_id
            };

            if (filters?.status) query.status = filters.status;
            if (filters?.service_status) query.service_status = filters.service_status;

            // Filtro por rango de fechas
            if (filters?.fecha_inicio || filters?.fecha_fin) {
                query.fecha = {};
                if (filters.fecha_inicio) query.fecha.$gte = filters.fecha_inicio;
                if (filters.fecha_fin) query.fecha.$lte = filters.fecha_fin;
            }

            const skip = (page - 1) * limit;

            const solicitudes = await solicitudModel
                .find(query)
                .populate('vehiculo_id', 'placa type flota seats name')
                .populate('conductor', 'full_name contact email')
                .populate('vehicle_assignments.vehiculo_id', 'placa type flota seats')
                .populate('vehicle_assignments.conductor_id', 'full_name contact email')
                .sort({ created: -1 })
                .skip(skip)
                .limit(limit)
                .lean();

            // Transformar solicitudes: eliminar campos duplicados y estructurar correctamente
            for (const solicitud of solicitudes) {
                const sol = solicitud as any;
                
                // Si vehicle_assignments está vacío o no existe, pero hay datos en campos individuales
                if ((!sol.vehicle_assignments || sol.vehicle_assignments.length === 0) && sol.vehiculo_id) {
                    // Crear vehicle_assignments desde los campos individuales
                    sol.vehicle_assignments = [{
                        vehiculo_id: sol.vehiculo_id,
                        placa: sol.placa || (sol.vehiculo_id?.placa),
                        seats: (sol.vehiculo_id as any)?.seats || sol.n_pasajeros || 0,
                        assigned_passengers: sol.n_pasajeros || 0,
                        conductor_id: sol.conductor ? {
                            _id: sol.conductor._id || sol.conductor,
                            full_name: sol.conductor.full_name || sol.conductor.name || "",
                            email: sol.conductor.email || "",
                            phone: sol.conductor.contact?.phone || sol.conductor.phone || sol.conductor_phone || ""
                        } : null,
                        contract_id: sol.contract_id || null,
                        contract_charge_mode: sol.contract_charge_mode || "no_contract",
                        contract_charge_amount: sol.contract_charge_amount || 0,
                        accounting: sol.vehicle_assignments?.[0]?.accounting || {}
                    }];
                    
                    // Eliminar campos duplicados del nivel superior después de crear vehicle_assignments
                    delete sol.placa;
                    delete sol.flota;
                    delete sol.conductor;
                    delete sol.conductor_phone;
                    delete sol.vehiculo_id;
                    delete sol.tipo_vehiculo;
                } else if (sol.vehicle_assignments && sol.vehicle_assignments.length > 0) {
                    // Asegurar que los campos populados estén correctamente estructurados
                    for (const assignment of sol.vehicle_assignments) {
                        // Eliminar conductor_phone duplicado si existe
                        delete assignment.conductor_phone;
                        
                        if (assignment.conductor_id && typeof assignment.conductor_id === 'object') {
                            // Asegurar que el conductor tenga full_name correctamente estructurado
                            if (!assignment.conductor_id.full_name && assignment.conductor_id.name) {
                                assignment.conductor_id.full_name = assignment.conductor_id.name;
                            }
                            // Asegurar que phone esté presente en conductor_id (extraer de contact.phone)
                            if (!assignment.conductor_id.phone) {
                                if (assignment.conductor_id.contact?.phone) {
                                    assignment.conductor_id.phone = assignment.conductor_id.contact.phone;
                                }
                            }
                        }
                    }
                    
                    // Eliminar campos duplicados del nivel superior cuando hay vehicle_assignments
                    delete sol.placa;
                    delete sol.flota;
                    delete sol.conductor;
                    delete sol.conductor_phone;
                    delete sol.vehiculo_id;
                    delete sol.tipo_vehiculo;
                }
            }

            const total = await solicitudModel.countDocuments(query);

            return {
                solicitudes,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudieron obtener las solicitudes del cliente");
        }
    }

    /**
     * Obtener detalle de una solicitud del cliente
     * Verifica que la solicitud pertenezca al cliente
     */
    public async get_client_solicitud_by_id({
        client_id,
        solicitud_id
    }: {
        client_id: string,
        solicitud_id: string
    }) {
        try {
            const solicitud = await solicitudModel
                .findOne({ 
                    _id: solicitud_id, 
                    cliente: client_id
                })
                .populate('vehiculo_id', 'placa type flota seats name description picture')
                .populate('conductor', 'full_name contact email avatar')
                .populate('vehicle_assignments.vehiculo_id', 'placa type flota seats name description picture')
                .populate('vehicle_assignments.conductor_id', 'full_name contact email avatar')
                .lean();

            if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada o no tienes acceso");

            const sol = solicitud as any;

            // Transformar solicitud: eliminar campos duplicados y estructurar correctamente
            // Si vehicle_assignments está vacío o no existe, pero hay datos en campos individuales
            if ((!sol.vehicle_assignments || sol.vehicle_assignments.length === 0) && sol.vehiculo_id) {
                // Crear vehicle_assignments desde los campos individuales
                sol.vehicle_assignments = [{
                    vehiculo_id: sol.vehiculo_id,
                    placa: sol.placa || (sol.vehiculo_id?.placa),
                    seats: (sol.vehiculo_id as any)?.seats || sol.n_pasajeros || 0,
                    assigned_passengers: sol.n_pasajeros || 0,
                    conductor_id: sol.conductor ? {
                        _id: sol.conductor._id || sol.conductor,
                        full_name: sol.conductor.full_name || sol.conductor.name || "",
                        email: sol.conductor.email || "",
                        phone: sol.conductor.contact?.phone || sol.conductor.phone || sol.conductor_phone || "",
                        avatar: sol.conductor.avatar || null
                    } : null,
                    contract_id: sol.contract_id || null,
                    contract_charge_mode: sol.contract_charge_mode || "no_contract",
                    contract_charge_amount: sol.contract_charge_amount || 0,
                    accounting: sol.vehicle_assignments?.[0]?.accounting || {}
                }];
                
                // Eliminar campos duplicados del nivel superior después de crear vehicle_assignments
                delete sol.placa;
                delete sol.flota;
                delete sol.conductor;
                delete sol.conductor_phone;
                delete sol.vehiculo_id;
                delete sol.tipo_vehiculo;
            } else if (sol.vehicle_assignments && sol.vehicle_assignments.length > 0) {
                // Asegurar que los campos populados estén correctamente estructurados
                for (const assignment of sol.vehicle_assignments) {
                    // Eliminar conductor_phone duplicado si existe
                    delete assignment.conductor_phone;
                    
                    if (assignment.conductor_id && typeof assignment.conductor_id === 'object') {
                        // Asegurar que el conductor tenga full_name correctamente estructurado
                        if (!assignment.conductor_id.full_name && assignment.conductor_id.name) {
                            assignment.conductor_id.full_name = assignment.conductor_id.name;
                        }
                        // Asegurar que phone esté presente en conductor_id (extraer de contact.phone)
                        if (!assignment.conductor_id.phone) {
                            if (assignment.conductor_id.contact?.phone) {
                                assignment.conductor_id.phone = assignment.conductor_id.contact.phone;
                            }
                        }
                    }
                }
                
                // Eliminar campos duplicados del nivel superior cuando hay vehicle_assignments
                delete sol.placa;
                delete sol.flota;
                delete sol.conductor;
                delete sol.conductor_phone;
                delete sol.vehiculo_id;
                delete sol.tipo_vehiculo;
            }

            return solicitud;
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo obtener la solicitud");
        }
    }

    //* #========== ACCOUNTING FLOW METHODS ==========#

    /**
     * Verificar que todos los vehículos de la solicitud tienen operacional subido
     * Retorna lista de vehículos que faltan operacional
     * Actualiza automáticamente el accounting_status si todos los operacionales están completos
     */
    public async verify_operationals_complete({
        solicitud_id,
        auto_update_status = true
    }: {
        solicitud_id: string;
        auto_update_status?: boolean; // Si true, actualiza el estado automáticamente
    }): Promise<{
        all_complete: boolean;
        missing_operationals: Array<{
            vehiculo_id: string;
            placa: string;
        }>;
    }> {
        try {
            const solicitud = await solicitudModel.findById(solicitud_id);
            if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada");

            const missing: Array<{ vehiculo_id: string; placa: string }> = [];

            // Obtener vehículos asignados
            const vehicleIds: string[] = [];
            
            // Si hay vehicle_assignments (multi-vehículo)
            if ((solicitud as any).vehicle_assignments && Array.isArray((solicitud as any).vehicle_assignments) && (solicitud as any).vehicle_assignments.length > 0) {
                (solicitud as any).vehicle_assignments.forEach((assignment: any) => {
                    if (assignment.vehiculo_id) {
                        vehicleIds.push(String(assignment.vehiculo_id));
                    }
                });
            } else if (solicitud.vehiculo_id) {
                // Si hay un solo vehículo
                vehicleIds.push(String(solicitud.vehiculo_id));
            }

            if (vehicleIds.length === 0) {
                throw new ResponseError(400, "La solicitud no tiene vehículos asignados");
            }

            // Normalizar solicitud_id a ObjectId para la búsqueda
            const solicitud_id_obj = new mongoose.Types.ObjectId(solicitud_id);

            // Verificar que cada vehículo tenga operacional vinculado a esta solicitud
            for (const vehicleId of vehicleIds) {
                // Normalizar vehicle_id a ObjectId
                const vehicle_id_obj = new mongoose.Types.ObjectId(vehicleId);
                
                // Buscar operacional vinculado a esta solicitud y vehículo
                const operational = await vhc_operationalModel.findOne({
                    vehicle_id: vehicle_id_obj,
                    solicitud_id: solicitud_id_obj
                });

                if (!operational) {
                    // Verificar si existe un operacional para este vehículo pero sin solicitud_id
                    // (para ayudar a debuggear si se subió sin vincular)
                    const operationalWithoutSolicitud = await vhc_operationalModel.findOne({
                        vehicle_id: vehicle_id_obj,
                        solicitud_id: { $exists: false }
                    }).sort({ created: -1 }).limit(1);

                    // Obtener placa del vehículo
                    const vehicle = await vehicleModel.findById(vehicleId).select("placa").lean();
                    const placa = (vehicle as any)?.placa || "N/A";
                    
                    missing.push({
                        vehiculo_id: vehicleId,
                        placa: placa
                    });

                    // Log para debuggear (opcional, puede removerse en producción)
                    if (operationalWithoutSolicitud) {
                        console.log(`⚠️ Operacional encontrado para vehículo ${placa} pero sin solicitud_id vinculado`);
                    }
                }
            }

            const allComplete = missing.length === 0;

            // Actualizar estado automáticamente si todos los operacionales están completos
            if (auto_update_status && allComplete) {
                try {
                    const solicitud = await solicitudModel.findById(solicitud_id);
                    if (solicitud) {
                        const currentStatus = (solicitud as any).accounting_status;
                        // Solo actualizar si está en pendiente_operacional
                        if (currentStatus === "pendiente_operacional") {
                            (solicitud as any).accounting_status = "operacional_completo";
                            await solicitud.save();
                        }
                    }
                } catch (updateError) {
                    // No lanzar error, solo loguear (la verificación ya se completó)
                    console.error("Error al actualizar estado de contabilidad en verify_operationals_complete:", updateError);
                }
            }

            return {
                all_complete: allComplete,
                missing_operationals: missing
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "Error al verificar operacionales");
        }
    }

    /**
     * Limpiar nombre del cliente para usar en número de prefactura
     * Elimina espacios, caracteres especiales y convierte a mayúsculas
     */
    private cleanClientNameForPrefactura(name: string): string {
        return name
            .trim()
            .toUpperCase()
            .replace(/\s+/g, '_') // Reemplazar espacios con guión bajo
            .replace(/[^A-Z0-9_]/g, '') // Eliminar caracteres especiales excepto guión bajo
            .replace(/_+/g, '_') // Reemplazar múltiples guiones bajos con uno solo
            .replace(/^_|_$/g, ''); // Eliminar guiones bajos al inicio y final
    }

    /**
     * Generar prefactura para una solicitud
     * Requiere que todos los vehículos tengan operacional subido
     * El número se genera automáticamente con el formato: PREF_{HE}_{NOMBRE_CLIENTE}
     */
    public async generate_prefactura({
        solicitud_id,
        user_id
    }: {
        solicitud_id: string;
        user_id: string;
    }) {
        try {
            const solicitud = await solicitudModel.findById(solicitud_id)
                .populate('cliente', 'name');
            if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada");

            // Validar que la solicitud tenga valores definidos (puede ser 0 para solicitudes gratuitas)
            if (solicitud.valor_a_facturar === undefined || solicitud.valor_a_facturar === null) {
                throw new ResponseError(400, "La solicitud no tiene valores de venta definidos");
            }

            if (solicitud.valor_cancelado === undefined || solicitud.valor_cancelado === null) {
                throw new ResponseError(400, "La solicitud no tiene valores de costos definidos");
            }

            // Verificar que todos los vehículos tengan operacional
            // No actualizar estado aquí porque ya estamos en el flujo de generar prefactura
            const operationalCheck = await this.verify_operationals_complete({ 
                solicitud_id,
                auto_update_status: false 
            });
            if (!operationalCheck.all_complete) {
                const missingPlacas = operationalCheck.missing_operationals.map(v => v.placa).join(", ");
                throw new ResponseError(400, `Faltan operacionales para los siguientes vehículos: ${missingPlacas}`);
            }

            // Validar que no haya una prefactura ya generada
            if ((solicitud as any).prefactura?.numero) {
                throw new ResponseError(400, "Ya existe una prefactura generada para esta solicitud");
            }

            // Obtener información del cliente
            const cliente = (solicitud as any).cliente;
            if (!cliente || !cliente.name) {
                throw new ResponseError(400, "No se puede generar la prefactura: la solicitud no tiene cliente asociado");
            }

            // Obtener el consecutivo de la solicitud (HE)
            const he = solicitud.he;
            if (!he) {
                throw new ResponseError(400, "No se puede generar la prefactura: la solicitud no tiene consecutivo (HE)");
            }

            // Generar número de prefactura automáticamente
            const nombreClienteLimpio = this.cleanClientNameForPrefactura(cliente.name);
            const prefactura_numero = `PREF_${he}_${nombreClienteLimpio}`;

            // Generar prefactura
            (solicitud as any).prefactura = {
                numero: prefactura_numero,
                fecha: new Date(),
                aprobada: false,
                estado: "pendiente",
                enviada_al_cliente: false,
                historial_envios: []
            };

            // Guardar auditoría
            (solicitud as any).generated_prefactura_by = user_id;
            (solicitud as any).generated_prefactura_at = new Date();
            (solicitud as any).accounting_status = "prefactura_pendiente";
            (solicitud as any).last_modified_by = user_id;

            await solicitud.save();

            // Populizar IDs de prefactura antes de retornar
            const solicitudObj = solicitud.toObject();
            await this.populate_prefactura_ids(solicitudObj);

            return {
                message: "Prefactura generada exitosamente",
                solicitud: solicitudObj
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "Error al generar prefactura");
        }
    }

    /**
     * Generar prefactura para múltiples solicitudes del mismo cliente
     * Todas las solicitudes compartirán el mismo número de prefactura
     * El número se genera automáticamente con el formato: PREF_MULTI_{HE_PRIMERA}-{HE_ULTIMA}_{NOMBRE_CLIENTE}
     */
    public async generate_prefactura_multiple({
        solicitud_ids,
        user_id
    }: {
        solicitud_ids: string[];
        user_id: string;
    }) {
        try {
            // Validar que se envíen solicitudes
            if (!solicitud_ids || solicitud_ids.length === 0) {
                throw new ResponseError(400, "Debe proporcionar al menos una solicitud");
            }

            if (solicitud_ids.length === 1) {
                // Si solo hay una solicitud, usar el método individual
                return await this.generate_prefactura({
                    solicitud_id: solicitud_ids[0],
                    user_id
                });
            }

            // Obtener todas las solicitudes
            const solicitudes = await solicitudModel.find({
                _id: { $in: solicitud_ids }
            }).populate('cliente', 'name');

            // Validar que todas las solicitudes existan
            if (solicitudes.length !== solicitud_ids.length) {
                const encontradas = solicitudes.map(s => s._id.toString());
                const noEncontradas = solicitud_ids.filter(id => !encontradas.includes(id));
                throw new ResponseError(404, `Las siguientes solicitudes no fueron encontradas: ${noEncontradas.join(", ")}`);
            }

            // Validar que todas pertenezcan al mismo cliente
            const clienteIds = solicitudes.map(s => (s.cliente as any)?._id?.toString() || s.cliente?.toString());
            const clienteUnico = [...new Set(clienteIds)];
            if (clienteUnico.length > 1) {
                throw new ResponseError(400, "Todas las solicitudes deben pertenecer al mismo cliente");
            }

            const clienteId = clienteUnico[0];
            const primeraSolicitud = solicitudes[0];
            const cliente = (primeraSolicitud as any).cliente;
            
            if (!cliente || !cliente.name) {
                throw new ResponseError(400, "No se puede generar la prefactura: las solicitudes no tienen cliente asociado");
            }

            // Validar que ninguna tenga prefactura ya generada
            const solicitudesConPrefactura = solicitudes.filter(s => (s as any).prefactura?.numero);
            if (solicitudesConPrefactura.length > 0) {
                const hesConPrefactura = solicitudesConPrefactura.map(s => s.he).join(", ");
                throw new ResponseError(400, `Las siguientes solicitudes ya tienen prefactura generada: ${hesConPrefactura}`);
            }

            // Validar valores y operacionales para cada solicitud
            const errores: string[] = [];
            const hesOrdenados = solicitudes.map(s => s.he).sort();

            for (const solicitud of solicitudes) {
                // Validar valores definidos
                if (solicitud.valor_a_facturar === undefined || solicitud.valor_a_facturar === null) {
                    errores.push(`La solicitud ${solicitud.he} no tiene valores de venta definidos`);
                    continue;
                }

                if (solicitud.valor_cancelado === undefined || solicitud.valor_cancelado === null) {
                    errores.push(`La solicitud ${solicitud.he} no tiene valores de costos definidos`);
                    continue;
                }

                // Validar operacionales
                const operationalCheck = await this.verify_operationals_complete({ 
                    solicitud_id: solicitud._id.toString(),
                    auto_update_status: false 
                });
                if (!operationalCheck.all_complete) {
                    const missingPlacas = operationalCheck.missing_operationals.map(v => v.placa).join(", ");
                    errores.push(`Faltan operacionales en la solicitud ${solicitud.he} para los vehículos: ${missingPlacas}`);
                }

                // Validar que tenga consecutivo (HE)
                if (!solicitud.he) {
                    errores.push(`La solicitud ${solicitud._id} no tiene consecutivo (HE)`);
                }
            }

            if (errores.length > 0) {
                throw new ResponseError(400, errores.join("; "));
            }

            // Generar número de prefactura automáticamente
            const nombreClienteLimpio = this.cleanClientNameForPrefactura(cliente.name);
            const hePrimera = hesOrdenados[0];
            const heUltima = hesOrdenados[hesOrdenados.length - 1];
            const prefactura_numero = hesOrdenados.length === 1 
                ? `PREF_${hePrimera}_${nombreClienteLimpio}`
                : `PREF_MULTI_${hePrimera}-${heUltima}_${nombreClienteLimpio}`;

            const fechaPrefactura = new Date();

            // Generar prefactura para todas las solicitudes
            const solicitudesActualizadas = [];
            for (const solicitud of solicitudes) {
                (solicitud as any).prefactura = {
                    numero: prefactura_numero,
                    fecha: fechaPrefactura,
                    aprobada: false,
                    estado: "pendiente",
                    enviada_al_cliente: false,
                    historial_envios: []
                };

                // Guardar auditoría
                (solicitud as any).generated_prefactura_by = user_id;
                (solicitud as any).generated_prefactura_at = fechaPrefactura;
                (solicitud as any).accounting_status = "prefactura_pendiente";
                (solicitud as any).last_modified_by = user_id;

                await solicitud.save();

                // Populizar IDs de prefactura antes de retornar
                const solicitudObj = solicitud.toObject();
                await this.populate_prefactura_ids(solicitudObj);
                solicitudesActualizadas.push(solicitudObj);
            }

            return {
                message: `Prefactura generada exitosamente para ${solicitudes.length} solicitud(es)`,
                prefactura_numero: prefactura_numero,
                solicitudes: solicitudesActualizadas
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "Error al generar prefactura múltiple");
        }
    }

    /**
     * Aprobar prefactura
     * Si ya está aprobada, permite reenviar al cliente
     * Al aprobar, automáticamente marca como "listo_para_facturacion"
     */
    public async approve_prefactura({
        solicitud_id,
        user_id,
        notas,
        reenviar = false
    }: {
        solicitud_id: string;
        user_id: string;
        notas?: string;
        reenviar?: boolean;
    }) {
        try {
            const solicitud = await solicitudModel.findById(solicitud_id);
            if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada");

            if (!(solicitud as any).prefactura?.numero) {
                throw new ResponseError(400, "No existe una prefactura generada para esta solicitud");
            }

            // Si ya está aprobada y se solicita reenviar, solo actualizar notas y retornar
            if ((solicitud as any).prefactura.aprobada && reenviar) {
                if (notas) {
                    (solicitud as any).prefactura.notas = notas;
                }
                (solicitud as any).last_modified_by = user_id;
                await solicitud.save();

                const solicitudObj = solicitud.toObject();
                await this.populate_prefactura_ids(solicitudObj);

                return {
                    message: "Prefactura ya aprobada. Lista para reenviar al cliente.",
                    solicitud: solicitudObj,
                    puede_reenviar: true
                };
            }

            // Si ya está aprobada y no se solicita reenviar, retornar error
            if ((solicitud as any).prefactura.aprobada && !reenviar) {
                throw new ResponseError(400, "La prefactura ya fue aprobada. Use el parámetro 'reenviar=true' para reenviarla al cliente.");
            }

            // Aprobar prefactura (primera vez)
            (solicitud as any).prefactura.aprobada = true;
            (solicitud as any).prefactura.aprobada_por = user_id;
            (solicitud as any).prefactura.aprobada_fecha = new Date();
            if (notas) {
                (solicitud as any).prefactura.notas = notas;
            }

            // Automáticamente marcar como listo para facturación
            (solicitud as any).accounting_status = "listo_para_facturacion";
            (solicitud as any).last_modified_by = user_id;

            await solicitud.save();

            // Populizar IDs de prefactura antes de retornar
            const solicitudObj = solicitud.toObject();
            await this.populate_prefactura_ids(solicitudObj);

            return {
                message: "Prefactura aprobada exitosamente y marcada como lista para facturación",
                solicitud: solicitudObj
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "Error al aprobar prefactura");
        }
    }

    /**
     * Rechazar prefactura
     */
    public async reject_prefactura({
        solicitud_id,
        user_id,
        notas
    }: {
        solicitud_id: string;
        user_id: string;
        notas?: string;
    }) {
        try {
            const solicitud = await solicitudModel.findById(solicitud_id);
            if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada");

            if (!(solicitud as any).prefactura?.numero) {
                throw new ResponseError(400, "No existe una prefactura generada para esta solicitud");
            }

            // Rechazar prefactura (volver a estado anterior)
            (solicitud as any).prefactura.aprobada = false;
            (solicitud as any).prefactura.rechazada_por = user_id;
            (solicitud as any).prefactura.rechazada_fecha = new Date();
            if (notas) {
                (solicitud as any).prefactura.notas = notas;
            }

            // Volver a estado de operacional completo para que se pueda regenerar la prefactura
            (solicitud as any).accounting_status = "operacional_completo";
            (solicitud as any).last_modified_by = user_id;

            await solicitud.save();

            // Populizar IDs de prefactura antes de retornar
            const solicitudObj = solicitud.toObject();
            await this.populate_prefactura_ids(solicitudObj);

            return {
                message: "Prefactura rechazada",
                solicitud: solicitudObj
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "Error al rechazar prefactura");
        }
    }

    /**
     * Marcar solicitud como lista para facturación
     * Se llama cuando el servicio se carga en el componente de facturación
     */
    public async mark_ready_for_billing({
        solicitud_id,
        user_id
    }: {
        solicitud_id: string;
        user_id: string;
    }) {
        try {
            const solicitud = await solicitudModel.findById(solicitud_id);
            if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada");

            if ((solicitud as any).accounting_status !== "prefactura_aprobada") {
                throw new ResponseError(400, "La prefactura debe estar aprobada antes de marcar como lista para facturación");
            }

            (solicitud as any).accounting_status = "listo_para_facturacion";
            (solicitud as any).last_modified_by = user_id;

            await solicitud.save();

            return {
                message: "Solicitud marcada como lista para facturación",
                solicitud: solicitud.toObject()
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "Error al marcar solicitud como lista para facturación");
        }
    }

    /**
     * Enviar prefactura al cliente
     * Permite reenviar la prefactura en cualquier momento si ya está generada
     * Genera el PDF y lo envía por correo
     */
    public async send_prefactura_to_client({
        solicitud_id,
        user_id,
        notas
    }: {
        solicitud_id: string;
        user_id: string;
        notas?: string;
    }) {
        try {
            const solicitud = await solicitudModel.findById(solicitud_id)
                .populate({
                    path: 'cliente',
                    select: 'name contacts phone email company_id',
                    populate: {
                        path: 'company_id',
                        select: 'company_name document logo'
                    }
                })
                .lean();

            if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada");

            // Validar que existe una prefactura generada
            if (!(solicitud as any).prefactura?.numero) {
                throw new ResponseError(400, "No existe una prefactura generada para esta solicitud");
            }

            const client = (solicitud as any).cliente;
            if (!client) {
                throw new ResponseError(400, "No se pudo obtener la información del cliente");
            }

            const company = (client as any)?.company_id;
            // Para el email: client_name debe ser el nombre del contacto (persona que recibe el email)
            // Para el PDF: cliente_name es el nombre del cliente (empresa) y contacto es el nombre del contacto
            const contactoName = (client?.contacts && Array.isArray(client.contacts) && client.contacts.length > 0) 
                ? client.contacts[0].name 
                : ((solicitud as any).contacto || client?.name || 'N/A');
            const clienteEmail = client?.email;

            if (!clienteEmail) {
                throw new ResponseError(400, "El cliente no tiene un email registrado");
            }

            // Generar PDF de la prefactura
            const { filename, buffer } = await this.generate_prefactura_pdf({ solicitud_id });

            // Generar link al dashboard del cliente
            // El frontend debería configurar la URL base
            const frontendUrl = process.env.FRONTEND_URL || 'https://dashboard.example.com';
            const dashboardLink = `${frontendUrl}/prefacturas/${solicitud_id}`;

            // Enviar email con PDF adjunto
            // En el saludo del email se usa el nombre del contacto (persona)
            await send_client_prefactura({
                client_name: contactoName,
                client_email: clienteEmail,
                company_name: company?.company_name || 'Empresa',
                prefactura_numero: (solicitud as any).prefactura.numero,
                he: (solicitud as any).he || 'N/A',
                prefactura_pdf: { filename, buffer },
                notas,
                dashboard_link: dashboardLink
            });

            // Actualizar historial de envíos (obtener solicitud sin populate para actualizar)
            const solicitudToUpdate = await solicitudModel.findById(solicitud_id);
            if (!solicitudToUpdate) throw new ResponseError(404, "Solicitud no encontrada");

            // Inicializar prefactura si no existe completamente
            if (!(solicitudToUpdate as any).prefactura) {
                (solicitudToUpdate as any).prefactura = {};
            }

            // Inicializar historial si no existe
            if (!(solicitudToUpdate as any).prefactura.historial_envios) {
                (solicitudToUpdate as any).prefactura.historial_envios = [];
            }

            // Actualizar estado
            (solicitudToUpdate as any).prefactura.estado = "aceptada";
            (solicitudToUpdate as any).prefactura.enviada_al_cliente = true;
            (solicitudToUpdate as any).prefactura.fecha_envio_cliente = new Date();
            (solicitudToUpdate as any).prefactura.enviada_por = user_id;

            // Agregar entrada al historial
            (solicitudToUpdate as any).prefactura.historial_envios.push({
                fecha: new Date(),
                estado: "aceptada",
                enviado_por: user_id,
                notas: notas || undefined
            });

            (solicitudToUpdate as any).last_modified_by = user_id;

            await solicitudToUpdate.save();

            // Populizar IDs de prefactura antes de retornar
            const solicitudObj = solicitudToUpdate.toObject();
            await this.populate_prefactura_ids(solicitudObj);

            return {
                message: "Prefactura enviada al cliente exitosamente",
                solicitud: solicitudObj
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            console.error("Error al enviar prefactura al cliente:", error);
            throw new ResponseError(500, `Error al enviar prefactura al cliente: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Cambiar estado de prefactura
     * Permite cambiar el estado (aceptada/rechazada) y registrar en historial
     */
    public async change_prefactura_status({
        solicitud_id,
        user_id,
        status,
        notas
    }: {
        solicitud_id: string;
        user_id: string;
        status: "aceptada" | "rechazada";
        notas?: string;
    }) {
        try {
            const solicitud = await solicitudModel.findById(solicitud_id);
            if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada");

            // Validar que existe una prefactura generada
            if (!(solicitud as any).prefactura?.numero) {
                throw new ResponseError(400, "No existe una prefactura generada para esta solicitud");
            }

            // Inicializar prefactura si no existe completamente
            if (!(solicitud as any).prefactura) {
                (solicitud as any).prefactura = {};
            }

            // Inicializar historial si no existe
            if (!(solicitud as any).prefactura.historial_envios) {
                (solicitud as any).prefactura.historial_envios = [];
            }

            // Actualizar estado
            (solicitud as any).prefactura.estado = status;

            // Si el estado es "aceptada", actualizar campos de envío
            if (status === "aceptada") {
                (solicitud as any).prefactura.enviada_al_cliente = true;
                (solicitud as any).prefactura.fecha_envio_cliente = new Date();
                (solicitud as any).prefactura.enviada_por = user_id;
            }

            // Agregar entrada al historial
            (solicitud as any).prefactura.historial_envios.push({
                fecha: new Date(),
                estado: status,
                enviado_por: user_id,
                notas: notas || undefined
            });

            (solicitud as any).last_modified_by = user_id;

            await solicitud.save();

            // Populizar IDs de prefactura antes de retornar
            const solicitudObj = solicitud.toObject();
            await this.populate_prefactura_ids(solicitudObj);

            return {
                message: `Prefactura marcada como ${status}`,
                solicitud: solicitudObj
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "Error al cambiar estado de prefactura");
        }
    }

    /**
     * Actualizar estado de operacional cuando se sube un operacional
     * Se llama automáticamente cuando se sube un operacional vinculado a una solicitud
     */
    public async update_accounting_status_on_operational_upload({
        solicitud_id
    }: {
        solicitud_id: string;
    }) {
        try {
            const solicitud = await solicitudModel.findById(solicitud_id);
            if (!solicitud) return; // No lanzar error, puede que la solicitud no exista aún

            const currentStatus = (solicitud as any).accounting_status;
            
            // Actualizar si está en estado pendiente_operacional o no_iniciado
            // (no_iniciado puede ocurrir si se sube operacional antes de establecer valores financieros)
            if (currentStatus === "pendiente_operacional" || currentStatus === "no_iniciado") {
                // Verificar si todos los vehículos tienen operacional
                const operationalCheck = await this.verify_operationals_complete({ solicitud_id });
                
                if (operationalCheck.all_complete) {
                    // Solo actualizar a operacional_completo si está en pendiente_operacional
                    // Si está en no_iniciado, mantenerlo así hasta que se establezcan valores financieros
                    if (currentStatus === "pendiente_operacional") {
                        (solicitud as any).accounting_status = "operacional_completo";
                        await solicitud.save();
                    }
                }
            }
        } catch (error) {
            // No lanzar error, solo loguear
            console.error("Error al actualizar estado de contabilidad:", error);
        }
    }

    /**
     * Obtener documentos de un vehículo (SOAT, licencia tránsito, etc.) como buffers
     */
    private async get_vehicle_documents_as_buffers(vehicle_id: string): Promise<Array<{ filename: string; buffer: Buffer }>> {
        try {
            const vehicleDocs = await vhc_documentsModel.findOne({ vehicle_id }).lean();
            if (!vehicleDocs) return [];

            const documents: Array<{ filename: string; buffer: Buffer }> = [];

            // Función auxiliar para descargar y convertir a buffer
            const downloadDocument = async (doc: any, name: string, placa?: string): Promise<void> => {
                if (doc?.url) {
                    try {
                        const response = await axios.get(doc.url, { responseType: 'arraybuffer' });
                        const extension = doc.file_extension || 'pdf';
                        const safePlaca = placa ? placa.replace(/[^a-zA-Z0-9_-]/g, "_") : vehicle_id;
                        documents.push({
                            filename: `${name}_${safePlaca}.${extension}`,
                            buffer: Buffer.from(response.data)
                        });
                    } catch (error) {
                        console.error(`Error descargando ${name}:`, error);
                    }
                }
            };

            // Obtener placa del vehículo para mejor nombre de archivo
            const vehicle = await vehicleModel.findById(vehicle_id).select('placa').lean();
            const placa = (vehicle as any)?.placa || '';

            await Promise.all([
                downloadDocument((vehicleDocs as any).soat, 'SOAT', placa),
                downloadDocument((vehicleDocs as any).licencia_transito, 'Licencia_Transito', placa),
            ]);

            return documents;
        } catch (error) {
            console.error("Error obteniendo documentos del vehículo:", error);
            return [];
        }
    }

    /**
     * Obtener documentos de un conductor (licencia conducción, cédula) como buffers
     * Genera PDFs combinando las 2 imágenes lado a lado
     */
    private async get_driver_documents_as_buffers(driver_id: string, driver_name?: string): Promise<Array<{ filename: string; buffer: Buffer }>> {
        try {
            const driverDocs = await driver_documentsModel.findOne({ driver_id }).lean();
            if (!driverDocs) return [];

            const documents: Array<{ filename: string; buffer: Buffer }> = [];

            // Función auxiliar para descargar imagen como base64
            const downloadImageAsBase64 = async (doc: any): Promise<string | null> => {
                if (!doc?.url) return null;
                try {
                    const response = await axios.get(doc.url, { responseType: 'arraybuffer' });
                    const base64 = Buffer.from(response.data).toString('base64');
                    const extension = doc.url.split('.').pop()?.split('?')[0] || 'jpg';
                    return `data:image/${extension === 'png' ? 'png' : 'jpeg'};base64,${base64}`;
                } catch (error) {
                    console.error(`Error descargando imagen:`, error);
                    return null;
                }
            };

            // Función auxiliar para generar PDF con 2 imágenes lado a lado
            const generateSideBySidePdf = async (
                frontImage: string | null,
                backImage: string | null,
                title: string,
                filename: string
            ): Promise<void> => {
                if (!frontImage && !backImage) return;

                const html = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="UTF-8">
                        <title>${title}</title>
                        <style>
                            body {
                                margin: 0;
                                padding: 20px;
                                font-family: Arial, sans-serif;
                            }
                            .container {
                                display: flex;
                                gap: 20px;
                                justify-content: center;
                                align-items: flex-start;
                            }
                            .image-container {
                                flex: 1;
                                max-width: 50%;
                            }
                            .image-container img {
                                width: 100%;
                                height: auto;
                                border: 1px solid #ddd;
                                border-radius: 4px;
                            }
                            .title {
                                text-align: center;
                                font-size: 16px;
                                font-weight: bold;
                                margin-bottom: 20px;
                                color: #333;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="title">${title}</div>
                        <div class="container">
                            ${frontImage ? `<div class="image-container"><img src="${frontImage}" alt="Frontal" /></div>` : ''}
                            ${backImage ? `<div class="image-container"><img src="${backImage}" alt="Trasera" /></div>` : ''}
                        </div>
                    </body>
                    </html>
                `;

                try {
                    const pdfBuffer = await renderHtmlToPdfBuffer(html);
                    documents.push({
                        filename,
                        buffer: pdfBuffer
                    });
                } catch (error) {
                    console.error(`Error generando PDF ${filename}:`, error);
                }
            };

            // Obtener nombre del conductor si no se proporciona
            let conductorName = driver_name;
            if (!conductorName) {
                const driver = await userModel.findById(driver_id).select('full_name').lean();
                conductorName = (driver as any)?.full_name || 'conductor';
            }
            const safeName = String(conductorName).replace(/[^a-zA-Z0-9_-]/g, "_");

            // Licencia de conducción (combinar front y back en un PDF)
            const licenciaFront = await downloadImageAsBase64((driverDocs as any).licencia_conduccion?.front);
            const licenciaBack = await downloadImageAsBase64((driverDocs as any).licencia_conduccion?.back);
            if (licenciaFront || licenciaBack) {
                await generateSideBySidePdf(
                    licenciaFront,
                    licenciaBack,
                    `Licencia de Conducción - ${conductorName}`,
                    `licencia_conduccion_${safeName}.pdf`
                );
            }

            // Cédula (combinar front y back en un PDF)
            const cedulaFront = await downloadImageAsBase64((driverDocs as any).document?.front);
            const cedulaBack = await downloadImageAsBase64((driverDocs as any).document?.back);
            if (cedulaFront || cedulaBack) {
                await generateSideBySidePdf(
                    cedulaFront,
                    cedulaBack,
                    `Cédula de Ciudadanía - ${conductorName}`,
                    `cedula_${safeName}.pdf`
                );
            }

            return documents;
        } catch (error) {
            console.error("Error obteniendo documentos del conductor:", error);
            return [];
        }
    }

    /**
     * Enviar correos cuando la solicitud está completamente rellenada
     * Envía al cliente: hojas de vida de conductores, SOATs, licencias, fichas técnicas de vehículos
     * Envía a cada conductor: manifiesto de pasajeros con información del servicio
     */
    private async send_emails_solicitud_complete({
        solicitud_id
    }: {
        solicitud_id: string;
    }): Promise<void> {
        try {
            const solicitud = await solicitudModel.findById(solicitud_id)
                .populate('cliente', 'name email contacts phone')
                .populate('conductor', 'full_name email')
                .populate('vehiculo_id')
                .populate('vehicle_assignments.vehiculo_id')
                .populate('vehicle_assignments.conductor_id', 'full_name email')
                .lean();

            if (!solicitud) return;

            const client = (solicitud as any).cliente;
            if (!client) return;

            // Obtener email del cliente
            const clientEmail = client.email || (client.contacts && Array.isArray(client.contacts) && client.contacts.length > 0 ? client.contacts[0].email : null);
            if (!clientEmail) return; // No hay email del cliente

            // Para el saludo del email al cliente, usar el nombre del contacto (persona que recibe)
            // El nombre del cliente (empresa) se muestra en otros lugares del email si es necesario
            const contactoName = (client.contacts && Array.isArray(client.contacts) && client.contacts.length > 0) 
                ? client.contacts[0].name 
                : ((solicitud as any).contacto || client.name || 'N/A');
            const clientName = contactoName; // Para el saludo del email

            // Determinar si hay vehicle_assignments o vehículo individual
            const vehicleAssignments = (solicitud as any).vehicle_assignments || [];
            const hasMultipleVehicles = vehicleAssignments.length > 0;

            // Importar servicios
            const { send_client_solicitud_complete, send_driver_solicitud_complete } = await import('@/email/index.email');
            const { UserService } = await import('@/services/users.service');
            const { VehicleServices } = await import('@/services/vehicles.service');

            const userService = new UserService();
            const vehicleService = new VehicleServices();

            // Preparar documentos para el cliente
            const clientAttachments: Array<{ filename: string; buffer: Buffer }> = [];
            const driverCvs: Array<{ filename: string; buffer: Buffer }> = [];
            const vehicleTechnicalSheets: Array<{ filename: string; buffer: Buffer }> = [];
            // Los documentos adicionales ahora están integrados en los PDFs principales

            // Procesar vehículos y conductores
            if (hasMultipleVehicles) {
                // Múltiples vehículos
                for (const assignment of vehicleAssignments) {
                    const vehiculo = assignment.vehiculo_id;
                    const conductor = assignment.conductor_id;

                    if (!vehiculo || !conductor) continue;

                    const vehiculoId = String(vehiculo._id || vehiculo);
                    const conductorId = String(conductor._id || conductor);

                    // Generar hoja de vida del conductor
                    try {
                        const driverCv = await userService.generate_driver_technical_sheet_pdf({
                            driver_id: conductorId
                        });
                        // Cambiar el nombre del archivo a hoja_de_vida_conductor_{nombre}
                        const conductorName = (conductor as any).full_name || 'conductor';
                        const safeName = String(conductorName).replace(/[^a-zA-Z0-9_-]/g, "_");
                        driverCvs.push({
                            filename: `hoja_de_vida_conductor_${safeName}.pdf`,
                            buffer: driverCv.buffer
                        });
                    } catch (error) {
                        console.error(`Error generando hoja de vida del conductor ${conductorId}:`, error);
                    }

                    // Generar ficha técnica del vehículo
                    try {
                        const vehicleSheet = await vehicleService.generate_vehicle_technical_sheet_pdf({
                            vehicle_id: vehiculoId
                        });
                        vehicleTechnicalSheets.push(vehicleSheet);
                    } catch (error) {
                        console.error(`Error generando ficha técnica del vehículo ${vehiculoId}:`, error);
                    }

                    // Generar PDFs de documentos del conductor (cédula y licencia)
                    try {
                        const conductorName = (conductor as any).full_name || 'conductor';
                        const driverDocs = await this.get_driver_documents_as_buffers(conductorId, conductorName);
                        clientAttachments.push(...driverDocs);
                    } catch (error) {
                        console.error(`Error generando documentos del conductor ${conductorId}:`, error);
                    }

                    // Descargar PDFs de documentos del vehículo (SOAT y licencia de tránsito)
                    try {
                        const vehicleDocs = await this.get_vehicle_documents_as_buffers(vehiculoId);
                        clientAttachments.push(...vehicleDocs);
                    } catch (error) {
                        console.error(`Error descargando documentos del vehículo ${vehiculoId}:`, error);
                    }

                    // Enviar manifiesto al conductor
                    const driverEmail = (conductor as any).email;
                    if (driverEmail) {
                        try {
                            const manifestPdf = await this.generate_passenger_manifest_pdf({
                                solicitud_id,
                                vehiculo_id: vehiculoId,
                                conductor_id: conductorId,
                                assigned_passengers: assignment.assigned_passengers
                            });

                            const fechaFormatted = dayjs((solicitud as any).fecha).format('DD/MM/YYYY');
                            // Asegurar que cliente_name sea el nombre del cliente y contacto sea el nombre del contacto
                            const clienteNombre = client.name || 'N/A';
                            const contactoNombre = (solicitud as any).contacto || (client.contacts && client.contacts.length > 0 ? client.contacts[0].name : 'N/A');
                            const contactoTelefono = (solicitud as any).contacto_phone || (client.contacts && client.contacts.length > 0 ? client.contacts[0].phone : 'N/A');
                            
                            await send_driver_solicitud_complete({
                                driver_name: (conductor as any).full_name || "",
                                driver_email: driverEmail,
                                solicitud_info: {
                                    fecha: fechaFormatted,
                                    hora_inicio: (solicitud as any).hora_inicio,
                                    origen: (solicitud as any).origen,
                                    destino: (solicitud as any).destino,
                                    n_pasajeros: assignment.assigned_passengers || 0,
                                    cliente_name: clienteNombre,
                                    contacto: contactoNombre,
                                    contacto_phone: contactoTelefono
                                },
                                passenger_manifest_pdf: manifestPdf
                            });
                        } catch (error) {
                            console.error(`Error enviando correo al conductor ${conductorId}:`, error);
                        }
                    }
                }
            } else {
                // Vehículo individual (compatibilidad)
                const vehiculo = (solicitud as any).vehiculo_id;
                const conductor = (solicitud as any).conductor;

                if (!vehiculo || !conductor) return;

                const vehiculoId = String(vehiculo._id || vehiculo);
                const conductorId = String(conductor._id || conductor);

                // Generar hoja de vida del conductor
                try {
                    const driverCv = await userService.generate_driver_technical_sheet_pdf({
                        driver_id: conductorId
                    });
                    // Cambiar el nombre del archivo a hoja_de_vida_conductor_{nombre}
                    const conductorName = (conductor as any).full_name || 'conductor';
                    const safeName = String(conductorName).replace(/[^a-zA-Z0-9_-]/g, "_");
                    driverCvs.push({
                        filename: `hoja_de_vida_conductor_${safeName}.pdf`,
                        buffer: driverCv.buffer
                    });
                } catch (error) {
                    console.error(`Error generando hoja de vida del conductor ${conductorId}:`, error);
                }

                // Generar ficha técnica del vehículo
                try {
                    const vehicleSheet = await vehicleService.generate_vehicle_technical_sheet_pdf({
                        vehicle_id: vehiculoId
                    });
                    vehicleTechnicalSheets.push(vehicleSheet);
                } catch (error) {
                    console.error(`Error generando ficha técnica del vehículo ${vehiculoId}:`, error);
                }

                // Los documentos del vehículo (SOAT, licencia tránsito) y del conductor (licencia, cédula)
                // ahora están integrados en los PDFs de las fichas técnicas

                // Enviar manifiesto al conductor
                const driverEmail = (conductor as any).email;
                if (driverEmail) {
                    try {
                        const manifestPdf = await this.generate_passenger_manifest_pdf({
                            solicitud_id,
                            vehiculo_id: vehiculoId,
                            conductor_id: conductorId,
                            assigned_passengers: (solicitud as any).n_pasajeros
                        });

                        const fechaFormatted = dayjs((solicitud as any).fecha).format('DD/MM/YYYY');
                        await send_driver_solicitud_complete({
                            driver_name: (conductor as any).full_name || "",
                            driver_email: driverEmail,
                            solicitud_info: {
                                fecha: fechaFormatted,
                                hora_inicio: (solicitud as any).hora_inicio,
                                origen: (solicitud as any).origen,
                                destino: (solicitud as any).destino,
                                n_pasajeros: (solicitud as any).n_pasajeros || 0,
                                cliente_name: clientName,
                                contacto: (solicitud as any).contacto || "",
                                contacto_phone: (solicitud as any).contacto_phone || ""
                            },
                            passenger_manifest_pdf: manifestPdf
                        });
                    } catch (error) {
                        console.error(`Error enviando correo al conductor ${conductorId}:`, error);
                    }
                }
            }

            // Combinar todos los documentos para el cliente
            clientAttachments.push(...driverCvs);
            clientAttachments.push(...vehicleTechnicalSheets);

            // Generar PDF de información de solicitud
            let solicitudInfoPdf: { filename: string; buffer: Buffer } | null = null;
            try {
                solicitudInfoPdf = await this.generate_solicitud_info_pdf({
                    solicitud_id
                });
            } catch (error) {
                console.error("Error generando PDF de información de solicitud:", error);
            }

            // Enviar correo al cliente con todos los documentos
            const fechaFormatted = dayjs((solicitud as any).fecha).format('DD/MM/YYYY');
            
            // Preparar lista de vehículos y conductores para el email
            let vehiculosConductoresList: Array<{ placa: string; conductor: string; pasajeros: number }> = [];
            if (hasMultipleVehicles) {
                vehiculosConductoresList = vehicleAssignments.map((assignment: any) => ({
                    placa: (assignment.vehiculo_id as any)?.placa || assignment.placa || 'N/A',
                    conductor: (assignment.conductor_id as any)?.full_name || 'N/A',
                    pasajeros: assignment.assigned_passengers || 0
                }));
            } else {
                const vehiculo = (solicitud as any).vehiculo_id;
                const conductor = (solicitud as any).conductor;
                vehiculosConductoresList = [{
                    placa: (vehiculo as any)?.placa || 'N/A',
                    conductor: (conductor as any)?.full_name || 'N/A',
                    pasajeros: (solicitud as any).n_pasajeros || 0
                }];
            }

            // Generar HTML de la tabla de vehículos y conductores
            const vehiculosTableHtml = vehiculosConductoresList.map((vc, idx) => 
                `<tr>
                    <td style="padding: 8px; text-align: left; border: 1px solid #ddd;">${idx + 1}</td>
                    <td style="padding: 8px; text-align: left; border: 1px solid #ddd;">${vc.placa}</td>
                    <td style="padding: 8px; text-align: left; border: 1px solid #ddd;">${vc.conductor}</td>
                    <td style="padding: 8px; text-align: left; border: 1px solid #ddd;">${vc.pasajeros}</td>
                </tr>`
            ).join('');

            await send_client_solicitud_complete({
                client_name: clientName,
                client_email: clientEmail,
                solicitud_info: {
                    fecha: fechaFormatted,
                    hora_inicio: (solicitud as any).hora_inicio,
                    origen: (solicitud as any).origen,
                    destino: (solicitud as any).destino,
                    n_pasajeros: (solicitud as any).n_pasajeros || 0,
                    vehiculos_table: vehiculosTableHtml || '<tr><td colspan="4" style="padding: 8px; text-align: left; border: 1px solid #ddd;">No hay vehículos asignados</td></tr>'
                },
                driver_cv_pdf: driverCvs, // Enviar todos los CVs
                vehicle_technical_sheets_pdf: vehicleTechnicalSheets,
                solicitud_info_pdf: solicitudInfoPdf || { filename: 'solicitud_info.pdf', buffer: Buffer.from('') },
                // Agregar documentos adicionales (cédulas, licencias, SOATs, licencias de tránsito)
                additional_attachments: clientAttachments.filter(att => 
                    !driverCvs.some(cv => cv.filename === att.filename) &&
                    !vehicleTechnicalSheets.some(vs => vs.filename === att.filename) &&
                    att.filename !== (solicitudInfoPdf?.filename || 'solicitud_info.pdf')
                )
            });
        } catch (error) {
            console.error("Error enviando correos de solicitud completa:", error);
            // No lanzar error para no interrumpir el flujo principal
        }
    }

    /**
     * Reenviar correos solo a los conductores asignados
     * Envía a cada conductor: manifiesto de pasajeros con información del servicio
     */
    public async resend_emails_to_drivers({
        solicitud_id
    }: {
        solicitud_id: string;
    }): Promise<void> {
        try {
            const solicitud = await solicitudModel.findById(solicitud_id)
                .populate('cliente', 'name email contacts phone')
                .populate('conductor', 'full_name email')
                .populate('vehiculo_id')
                .populate('vehicle_assignments.vehiculo_id')
                .populate('vehicle_assignments.conductor_id', 'full_name email')
                .lean();

            if (!solicitud) {
                throw new ResponseError(404, "Solicitud no encontrada");
            }

            const client = (solicitud as any).cliente;
            if (!client) {
                throw new ResponseError(400, "No se pudo obtener la información del cliente");
            }

            // Para el saludo del email al cliente, usar el nombre del contacto (persona que recibe)
            const contactoName = (client.contacts && Array.isArray(client.contacts) && client.contacts.length > 0) 
                ? client.contacts[0].name 
                : ((solicitud as any).contacto || client.name || 'N/A');
            const clientName = contactoName; // Para el saludo del email

            // Determinar si hay vehicle_assignments o vehículo individual
            const vehicleAssignments = (solicitud as any).vehicle_assignments || [];
            const hasMultipleVehicles = vehicleAssignments.length > 0;

            // Importar servicios
            const { send_driver_solicitud_complete } = await import('@/email/index.email');

            // Procesar vehículos y conductores
            if (hasMultipleVehicles) {
                // Múltiples vehículos
                for (const assignment of vehicleAssignments) {
                    const vehiculo = assignment.vehiculo_id;
                    const conductor = assignment.conductor_id;

                    if (!vehiculo || !conductor) continue;

                    const vehiculoId = String(vehiculo._id || vehiculo);
                    const conductorId = String(conductor._id || conductor);

                    // Enviar manifiesto al conductor
                    const driverEmail = (conductor as any).email;
                    if (driverEmail) {
                        try {
                            const manifestPdf = await this.generate_passenger_manifest_pdf({
                                solicitud_id,
                                vehiculo_id: vehiculoId,
                                conductor_id: conductorId,
                                assigned_passengers: assignment.assigned_passengers
                            });

                            const fechaFormatted = dayjs((solicitud as any).fecha).format('DD/MM/YYYY');
                            // Asegurar que cliente_name sea el nombre del cliente y contacto sea el nombre del contacto
                            const clienteNombre = client.name || 'N/A';
                            const contactoNombre = (solicitud as any).contacto || (client.contacts && client.contacts.length > 0 ? client.contacts[0].name : 'N/A');
                            const contactoTelefono = (solicitud as any).contacto_phone || (client.contacts && client.contacts.length > 0 ? client.contacts[0].phone : 'N/A');
                            
                            await send_driver_solicitud_complete({
                                driver_name: (conductor as any).full_name || "",
                                driver_email: driverEmail,
                                solicitud_info: {
                                    fecha: fechaFormatted,
                                    hora_inicio: (solicitud as any).hora_inicio,
                                    origen: (solicitud as any).origen,
                                    destino: (solicitud as any).destino,
                                    n_pasajeros: assignment.assigned_passengers || 0,
                                    cliente_name: clienteNombre,
                                    contacto: contactoNombre,
                                    contacto_phone: contactoTelefono
                                },
                                passenger_manifest_pdf: manifestPdf
                            });
                        } catch (error) {
                            console.error(`Error enviando correo al conductor ${conductorId}:`, error);
                            throw error;
                        }
                    }
                }
            } else {
                // Vehículo individual (compatibilidad)
                const vehiculo = (solicitud as any).vehiculo_id;
                const conductor = (solicitud as any).conductor;

                if (!vehiculo || !conductor) {
                    throw new ResponseError(400, "No hay vehículos o conductores asignados a esta solicitud");
                }

                const vehiculoId = String(vehiculo._id || vehiculo);
                const conductorId = String(conductor._id || conductor);

                // Enviar manifiesto al conductor
                const driverEmail = (conductor as any).email;
                if (driverEmail) {
                    try {
                        const manifestPdf = await this.generate_passenger_manifest_pdf({
                            solicitud_id,
                            vehiculo_id: vehiculoId,
                            conductor_id: conductorId,
                            assigned_passengers: (solicitud as any).n_pasajeros
                        });

                        const fechaFormatted = dayjs((solicitud as any).fecha).format('DD/MM/YYYY');
                        // Asegurar que cliente_name sea el nombre del cliente y contacto sea el nombre del contacto
                        const clienteNombre = client.name || 'N/A';
                        const contactoNombre = (solicitud as any).contacto || (client.contacts && client.contacts.length > 0 ? client.contacts[0].name : 'N/A');
                        const contactoTelefono = (solicitud as any).contacto_phone || (client.contacts && client.contacts.length > 0 ? client.contacts[0].phone : 'N/A');
                        
                        await send_driver_solicitud_complete({
                            driver_name: (conductor as any).full_name || "",
                            driver_email: driverEmail,
                            solicitud_info: {
                                fecha: fechaFormatted,
                                hora_inicio: (solicitud as any).hora_inicio,
                                origen: (solicitud as any).origen,
                                destino: (solicitud as any).destino,
                                n_pasajeros: (solicitud as any).n_pasajeros || 0,
                                cliente_name: clienteNombre,
                                contacto: contactoNombre,
                                contacto_phone: contactoTelefono
                            },
                            passenger_manifest_pdf: manifestPdf
                        });
                    } catch (error) {
                        console.error(`Error enviando correo al conductor ${conductorId}:`, error);
                        throw error;
                    }
                } else {
                    throw new ResponseError(400, "El conductor asignado no tiene email registrado");
                }
            }
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "Error al reenviar correos a los conductores");
        }
    }

    /**
     * Reenviar correo solo al cliente
     * Envía al cliente: hojas de vida de conductores, SOATs, licencias, fichas técnicas de vehículos
     */
    public async resend_email_to_client({
        solicitud_id
    }: {
        solicitud_id: string;
    }): Promise<void> {
        try {
            const solicitud = await solicitudModel.findById(solicitud_id)
                .populate('cliente', 'name email contacts phone')
                .populate('conductor', 'full_name email')
                .populate('vehiculo_id')
                .populate('vehicle_assignments.vehiculo_id')
                .populate('vehicle_assignments.conductor_id', 'full_name email')
                .lean();

            if (!solicitud) {
                throw new ResponseError(404, "Solicitud no encontrada");
            }

            const client = (solicitud as any).cliente;
            if (!client) {
                throw new ResponseError(400, "No se pudo obtener la información del cliente");
            }

            // Obtener email del cliente
            const clientEmail = client.email || (client.contacts && Array.isArray(client.contacts) && client.contacts.length > 0 ? client.contacts[0].email : null);
            if (!clientEmail) {
                throw new ResponseError(400, "El cliente no tiene email registrado");
            }

            const clientName = (client.contacts && Array.isArray(client.contacts) && client.contacts.length > 0) ? client.contacts[0].name : client.name;

            // Determinar si hay vehicle_assignments o vehículo individual
            const vehicleAssignments = (solicitud as any).vehicle_assignments || [];
            const hasMultipleVehicles = vehicleAssignments.length > 0;

            // Importar servicios
            const { send_client_solicitud_complete } = await import('@/email/index.email');
            const { UserService } = await import('@/services/users.service');
            const { VehicleServices } = await import('@/services/vehicles.service');

            const userService = new UserService();
            const vehicleService = new VehicleServices();

            // Preparar documentos para el cliente
            const clientAttachments: Array<{ filename: string; buffer: Buffer }> = [];
            const driverCvs: Array<{ filename: string; buffer: Buffer }> = [];
            const vehicleTechnicalSheets: Array<{ filename: string; buffer: Buffer }> = [];

            // Procesar vehículos y conductores
            if (hasMultipleVehicles) {
                // Múltiples vehículos
                for (const assignment of vehicleAssignments) {
                    const vehiculo = assignment.vehiculo_id;
                    const conductor = assignment.conductor_id;

                    if (!vehiculo || !conductor) continue;

                    const vehiculoId = String(vehiculo._id || vehiculo);
                    const conductorId = String(conductor._id || conductor);

                    // Generar hoja de vida del conductor
                    try {
                        const driverCv = await userService.generate_driver_technical_sheet_pdf({
                            driver_id: conductorId
                        });
                        // Cambiar el nombre del archivo a hoja_de_vida_conductor_{nombre}
                        const conductorName = (conductor as any).full_name || 'conductor';
                        const safeName = String(conductorName).replace(/[^a-zA-Z0-9_-]/g, "_");
                        driverCvs.push({
                            filename: `hoja_de_vida_conductor_${safeName}.pdf`,
                            buffer: driverCv.buffer
                        });
                    } catch (error) {
                        console.error(`Error generando hoja de vida del conductor ${conductorId}:`, error);
                    }

                    // Generar ficha técnica del vehículo
                    try {
                        const vehicleSheet = await vehicleService.generate_vehicle_technical_sheet_pdf({
                            vehicle_id: vehiculoId
                        });
                        vehicleTechnicalSheets.push(vehicleSheet);
                    } catch (error) {
                        console.error(`Error generando ficha técnica del vehículo ${vehiculoId}:`, error);
                    }

                    // Generar PDFs de documentos del conductor (cédula y licencia)
                    try {
                        const conductorName = (conductor as any).full_name || 'conductor';
                        const driverDocs = await this.get_driver_documents_as_buffers(conductorId, conductorName);
                        clientAttachments.push(...driverDocs);
                    } catch (error) {
                        console.error(`Error generando documentos del conductor ${conductorId}:`, error);
                    }

                    // Descargar PDFs de documentos del vehículo (SOAT y licencia de tránsito)
                    try {
                        const vehicleDocs = await this.get_vehicle_documents_as_buffers(vehiculoId);
                        clientAttachments.push(...vehicleDocs);
                    } catch (error) {
                        console.error(`Error descargando documentos del vehículo ${vehiculoId}:`, error);
                    }
                }
            } else {
                // Vehículo individual (compatibilidad)
                const vehiculo = (solicitud as any).vehiculo_id;
                const conductor = (solicitud as any).conductor;

                if (!vehiculo || !conductor) {
                    throw new ResponseError(400, "No hay vehículos o conductores asignados a esta solicitud");
                }

                const vehiculoId = String(vehiculo._id || vehiculo);
                const conductorId = String(conductor._id || conductor);

                // Generar hoja de vida del conductor
                try {
                    const driverCv = await userService.generate_driver_technical_sheet_pdf({
                        driver_id: conductorId
                    });
                    driverCvs.push(driverCv);
                } catch (error) {
                    console.error(`Error generando hoja de vida del conductor ${conductorId}:`, error);
                }

                // Generar ficha técnica del vehículo
                try {
                    const vehicleSheet = await vehicleService.generate_vehicle_technical_sheet_pdf({
                        vehicle_id: vehiculoId
                    });
                    vehicleTechnicalSheets.push(vehicleSheet);
                } catch (error) {
                    console.error(`Error generando ficha técnica del vehículo ${vehiculoId}:`, error);
                }

                // Generar PDFs de documentos del conductor (cédula y licencia)
                try {
                    const conductorName = (conductor as any).full_name || 'conductor';
                    const driverDocs = await this.get_driver_documents_as_buffers(conductorId, conductorName);
                    clientAttachments.push(...driverDocs);
                } catch (error) {
                    console.error(`Error generando documentos del conductor ${conductorId}:`, error);
                }

                // Descargar PDFs de documentos del vehículo (SOAT y licencia de tránsito)
                try {
                    const vehicleDocs = await this.get_vehicle_documents_as_buffers(vehiculoId);
                    clientAttachments.push(...vehicleDocs);
                } catch (error) {
                    console.error(`Error descargando documentos del vehículo ${vehiculoId}:`, error);
                }
            }

            // Combinar todos los documentos para el cliente
            clientAttachments.push(...driverCvs);
            clientAttachments.push(...vehicleTechnicalSheets);

            // Generar PDF de información de solicitud
            let solicitudInfoPdf: { filename: string; buffer: Buffer } | null = null;
            try {
                solicitudInfoPdf = await this.generate_solicitud_info_pdf({
                    solicitud_id
                });
            } catch (error) {
                console.error("Error generando PDF de información de solicitud:", error);
            }

            // Enviar correo al cliente con todos los documentos
            const fechaFormatted = dayjs((solicitud as any).fecha).format('DD/MM/YYYY');
            
            // Preparar lista de vehículos y conductores para el email
            let vehiculosConductoresList: Array<{ placa: string; conductor: string; pasajeros: number }> = [];
            if (hasMultipleVehicles) {
                vehiculosConductoresList = vehicleAssignments.map((assignment: any) => ({
                    placa: (assignment.vehiculo_id as any)?.placa || assignment.placa || 'N/A',
                    conductor: (assignment.conductor_id as any)?.full_name || 'N/A',
                    pasajeros: assignment.assigned_passengers || 0
                }));
            } else {
                const vehiculo = (solicitud as any).vehiculo_id;
                const conductor = (solicitud as any).conductor;
                vehiculosConductoresList = [{
                    placa: (vehiculo as any)?.placa || 'N/A',
                    conductor: (conductor as any)?.full_name || 'N/A',
                    pasajeros: (solicitud as any).n_pasajeros || 0
                }];
            }

            // Generar HTML de la tabla de vehículos y conductores
            const vehiculosTableHtml = vehiculosConductoresList.map((vc, idx) => 
                `<tr>
                    <td style="padding: 8px; text-align: left; border: 1px solid #ddd;">${idx + 1}</td>
                    <td style="padding: 8px; text-align: left; border: 1px solid #ddd;">${vc.placa}</td>
                    <td style="padding: 8px; text-align: left; border: 1px solid #ddd;">${vc.conductor}</td>
                    <td style="padding: 8px; text-align: left; border: 1px solid #ddd;">${vc.pasajeros}</td>
                </tr>`
            ).join('');

            await send_client_solicitud_complete({
                client_name: clientName,
                client_email: clientEmail,
                solicitud_info: {
                    fecha: fechaFormatted,
                    hora_inicio: (solicitud as any).hora_inicio,
                    origen: (solicitud as any).origen,
                    destino: (solicitud as any).destino,
                    n_pasajeros: (solicitud as any).n_pasajeros || 0,
                    vehiculos_table: vehiculosTableHtml || '<tr><td colspan="4" style="padding: 8px; text-align: left; border: 1px solid #ddd;">No hay vehículos asignados</td></tr>'
                },
                driver_cv_pdf: driverCvs, // Enviar todos los CVs
                vehicle_technical_sheets_pdf: vehicleTechnicalSheets,
                solicitud_info_pdf: solicitudInfoPdf || { filename: 'solicitud_info.pdf', buffer: Buffer.from('') },
                // Agregar documentos adicionales (cédulas, licencias, SOATs, licencias de tránsito)
                additional_attachments: clientAttachments.filter(att => 
                    !driverCvs.some(cv => cv.filename === att.filename) &&
                    !vehicleTechnicalSheets.some(vs => vs.filename === att.filename) &&
                    att.filename !== (solicitudInfoPdf?.filename || 'solicitud_info.pdf')
                )
            });
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "Error al reenviar correo al cliente");
        }
    }

    /**
     * Generar PDF de información de solicitud
     */
    private async generate_solicitud_info_pdf({
        solicitud_id
    }: {
        solicitud_id: string;
    }): Promise<{ filename: string; buffer: Buffer }> {
        try {
            const solicitud = await solicitudModel.findById(solicitud_id)
                .populate('cliente', 'name contacts phone')
                .populate('conductor', 'full_name')
                .populate('vehiculo_id', 'placa type')
                .populate('vehicle_assignments.vehiculo_id', 'placa type')
                .populate('vehicle_assignments.conductor_id', 'full_name')
                .lean();

            if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada");

            const client = (solicitud as any).cliente;
            const vehicleAssignments = (solicitud as any).vehicle_assignments || [];
            const hasMultipleVehicles = vehicleAssignments.length > 0;

            const fechaExpedicion = dayjs(new Date()).format("DD/MM/YYYY HH:mm");
            const fechaServicio = dayjs((solicitud as any).fecha).format('DD/MM/YYYY');
            const fechaFinal = dayjs((solicitud as any).fecha_final).format('DD/MM/YYYY');

            // Generar tabla de vehículos y conductores
            let vehiculosConductoresTable = '';
            if (hasMultipleVehicles) {
                vehiculosConductoresTable = vehicleAssignments.map((assignment: any, index: number) => {
                    const vehiculo = assignment.vehiculo_id;
                    const conductor = assignment.conductor_id;
                    const placa = vehiculo?.placa || assignment.placa || 'N/A';
                    const tipo = vehiculo?.type || 'N/A';
                    const conductorName = conductor?.full_name || 'N/A';
                    const pasajeros = assignment.assigned_passengers || 0;
                    return `
                        <tr>
                            <td>${index + 1}</td>
                            <td>${placa}</td>
                            <td>${tipo}</td>
                            <td>${conductorName}</td>
                            <td>${pasajeros}</td>
                        </tr>
                    `;
                }).join('');
            } else {
                const conductor = (solicitud as any).conductor;
                const vehicle = (solicitud as any).vehiculo_id;
                vehiculosConductoresTable = `
                    <tr>
                        <td>1</td>
                        <td>${vehicle?.placa || 'N/A'}</td>
                        <td>${vehicle?.type || 'N/A'}</td>
                        <td>${(conductor as any)?.full_name || 'N/A'}</td>
                        <td>${(solicitud as any).n_pasajeros || 0}</td>
                    </tr>
                `;
            }

            // Crear HTML simple para el PDF
            const html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <title>Información de Solicitud</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 20px; }
                        h1 { color: #333; }
                        h2 { color: #555; margin-top: 30px; }
                        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
                        th { background-color: #f2f2f2; font-weight: bold; }
                    </style>
                </head>
                <body>
                    <h1>Información de Solicitud de Servicio</h1>
                    <p><strong>Fecha de Expedición:</strong> ${fechaExpedicion}</p>
                    
                    <h2>Información General</h2>
                    <table>
                        <tr><th>Campo</th><th>Valor</th></tr>
                        <tr><td>HE</td><td>${(solicitud as any).he || 'N/A'}</td></tr>
                        <tr><td>Fecha de Inicio</td><td>${fechaServicio}</td></tr>
                        <tr><td>Fecha Final</td><td>${fechaFinal}</td></tr>
                        <tr><td>Hora de Inicio</td><td>${(solicitud as any).hora_inicio || 'N/A'}</td></tr>
                        <tr><td>Origen</td><td>${(solicitud as any).origen || 'N/A'}</td></tr>
                        <tr><td>Destino</td><td>${(solicitud as any).destino || 'N/A'}</td></tr>
                        <tr><td>N° Pasajeros</td><td>${(solicitud as any).n_pasajeros || 0}</td></tr>
                        <tr><td>Cliente</td><td>${client.name || 'N/A'}</td></tr>
                        <tr><td>Contacto</td><td>${(solicitud as any).contacto || (client.contacts && client.contacts.length > 0 ? client.contacts[0].name : 'N/A')}</td></tr>
                        <tr><td>Teléfono Contacto</td><td>${(solicitud as any).contacto_phone || (client.contacts && client.contacts.length > 0 ? client.contacts[0].phone : 'N/A')}</td></tr>
                        ${(solicitud as any).novedades ? `<tr><td>Novedades</td><td>${(solicitud as any).novedades}</td></tr>` : ''}
                    </table>

                    <h2>Vehículos y Conductores Asignados</h2>
                    <table>
                        <tr>
                            <th>#</th>
                            <th>Placa</th>
                            <th>Tipo</th>
                            <th>Conductor</th>
                            <th>Pasajeros</th>
                        </tr>
                        ${vehiculosConductoresTable}
                    </table>
                </body>
                </html>
            `;

            const pdfBuffer = await renderHtmlToPdfBuffer(html);
            const filename = `informacion_solicitud_${(solicitud as any).he || solicitud_id}_${dayjs().format("YYYYMMDD_HHmm")}.pdf`;
            return { filename, buffer: pdfBuffer };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "Error al generar PDF de información de solicitud");
        }
    }

    /**
     * Generar PDF de prefactura
     */
    public async generate_prefactura_pdf({
        solicitud_id
    }: {
        solicitud_id: string;
    }): Promise<{ filename: string; buffer: Buffer }> {
        try {
            const solicitud = await solicitudModel.findById(solicitud_id)
                .populate({
                    path: 'cliente',
                    select: 'name contacts phone email company_id',
                    populate: {
                        path: 'company_id',
                        select: 'company_name document logo'
                    }
                })
                .populate('conductor', 'full_name')
                .populate('vehiculo_id', 'placa type')
                .populate('vehicle_assignments.vehiculo_id', 'placa type')
                .populate('vehicle_assignments.conductor_id', 'full_name')
                .lean();

            if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada");

            // Validar que existe una prefactura generada
            if (!(solicitud as any).prefactura?.numero) {
                throw new ResponseError(400, "No existe una prefactura generada para esta solicitud");
            }

            const client = (solicitud as any).cliente;
            const conductor = (solicitud as any).conductor;
            const vehicle = (solicitud as any).vehiculo_id;

            if (!client) {
                throw new ResponseError(400, "No se pudo obtener la información del cliente");
            }

            // Obtener la compañía desde el cliente populado
            const company = (client as any)?.company_id;

            const fechaExpedicion = dayjs(new Date()).format("DD/MM/YYYY");
            const fechaServicio = dayjs((solicitud as any).fecha).format('DD/MM/YYYY');
            const fechaFinal = dayjs((solicitud as any).fecha_final).format('DD/MM/YYYY');
            const prefacturaNumero = (solicitud as any).prefactura.numero;
            const nit = company?.document?.number
                ? `${company.document.number}${company.document.dv ? "-" + company.document.dv : ""}`
                : "";

            // Formatear valores monetarios
            const formatCurrency = (value: number) => {
                return new Intl.NumberFormat('es-CO', {
                    style: 'currency',
                    currency: 'COP',
                    minimumFractionDigits: 0
                }).format(value || 0);
            };

            // Preparar variables para el template
            // cliente_name debe ser el nombre del cliente (empresa), contacto debe ser el nombre del contacto (persona)
            const clienteName = client?.name || 'N/A';
            const contactoNombre = (solicitud as any).contacto || (client?.contacts && client.contacts.length > 0 ? client.contacts[0].name : 'N/A');
            const contactoTelefono = (solicitud as any).contacto_phone || (client?.contacts && client.contacts.length > 0 ? client.contacts[0].phone : 'N/A');
            const clienteEmail = client?.email || 'N/A';
            const novedadesSection = (solicitud as any).novedades 
                ? `<div class="info-section"><h3>Novedades</h3><p>${String((solicitud as any).novedades).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p></div>`
                : '';

            // Generar tabla de vehículos y conductores
            let vehiculosTableRows = '';
            const vehicleAssignments = (solicitud as any).vehicle_assignments || [];
            
            if (vehicleAssignments.length > 0) {
                // Usar vehicle_assignments si existe
                vehiculosTableRows = vehicleAssignments.map((assignment: any) => {
                    const vehiculo = assignment.vehiculo_id;
                    const conductor = assignment.conductor_id;
                    const placa = vehiculo?.placa || assignment.placa || 'N/A';
                    const conductorName = conductor?.full_name || 'N/A';
                    const pasajeros = assignment.assigned_passengers || 0;
                    return `<tr><td>${placa}</td><td>${conductorName}</td><td>${pasajeros}</td></tr>`;
                }).join('');
            } else if (vehicle && conductor) {
                // Fallback: usar vehículo y conductor individuales si no hay vehicle_assignments
                const placa = vehicle?.placa || 'N/A';
                const conductorName = (conductor as any)?.full_name || 'N/A';
                const pasajeros = (solicitud as any).n_pasajeros || 0;
                vehiculosTableRows = `<tr><td>${placa}</td><td>${conductorName}</td><td>${pasajeros}</td></tr>`;
            } else {
                vehiculosTableRows = '<tr><td colspan="3">No hay vehículos asignados</td></tr>';
            }

            // Leer template HTML
            const templatePath = this.resolveTemplatePath("prefactura.html");
            if (!fs.existsSync(templatePath)) {
                throw new ResponseError(500, `Template de prefactura no encontrado en: ${templatePath}`);
            }
            
            const htmlTemplate = fs.readFileSync(templatePath, "utf8");
            const html = this.replaceVariables(htmlTemplate, {
                prefactura_numero: String(prefacturaNumero || 'N/A'),
                company_name: String(company?.company_name || 'Empresa'),
                company_nit: String(nit || 'N/A'),
                cliente_name: String(clienteName), // Nombre del cliente (empresa)
                contacto: String(contactoNombre), // Nombre del contacto (persona)
                contacto_phone: String(contactoTelefono),
                cliente_email: String(clienteEmail),
                he: String((solicitud as any).he || 'N/A'),
                fecha_inicio: fechaServicio,
                fecha_final: fechaFinal,
                hora_inicio: String((solicitud as any).hora_inicio || 'N/A'),
                origen: String((solicitud as any).origen || 'N/A'),
                destino: String((solicitud as any).destino || 'N/A'),
                n_pasajeros: String((solicitud as any).n_pasajeros || 0),
                vehiculos_table: vehiculosTableRows,
                valor_a_facturar: formatCurrency((solicitud as any).valor_a_facturar || 0),
                novedades_section: novedadesSection,
                fecha_expedicion: fechaExpedicion
            });

            const pdfBuffer = await renderHtmlToPdfBuffer(html);
            const filename = `prefactura_${prefacturaNumero}_${dayjs().format("YYYYMMDD_HHmm")}.pdf`;
            return { filename, buffer: pdfBuffer };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            console.error("Error al generar PDF de prefactura:", error);
            throw new ResponseError(500, `Error al generar PDF de prefactura: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Helper para populizar los IDs de la prefactura
     * Populiza: aprobada_por, rechazada_por, enviada_por, historial_envios[].enviado_por
     */
    private async populate_prefactura_ids(solicitud: any): Promise<any> {
        if (!solicitud || !solicitud.prefactura) {
            return solicitud;
        }

        const prefactura = solicitud.prefactura;
        const userFields = 'name full_name email';

        // Recopilar todos los IDs únicos que necesitan populate
        const userIdsToPopulate = new Set<string>();
        
        if (prefactura.aprobada_por) {
            userIdsToPopulate.add(String(prefactura.aprobada_por));
        }
        if (prefactura.rechazada_por) {
            userIdsToPopulate.add(String(prefactura.rechazada_por));
        }
        if (prefactura.enviada_por) {
            userIdsToPopulate.add(String(prefactura.enviada_por));
        }
        
        if (prefactura.historial_envios && Array.isArray(prefactura.historial_envios)) {
            prefactura.historial_envios.forEach((item: any) => {
                if (item.enviado_por) {
                    userIdsToPopulate.add(String(item.enviado_por));
                }
            });
        }

        // Si no hay IDs para populizar, retornar sin cambios
        if (userIdsToPopulate.size === 0) {
            return solicitud;
        }

        // Hacer una sola consulta para obtener todos los usuarios
        const userIdsArray = Array.from(userIdsToPopulate);
        const users = await userModel.find({ _id: { $in: userIdsArray } }).select(userFields).lean();
        
        // Crear un mapa para acceso rápido
        const usersMap = new Map();
        users.forEach((user: any) => {
            usersMap.set(String(user._id), user);
        });

        // Asignar usuarios populizados
        if (prefactura.aprobada_por) {
            const userId = String(prefactura.aprobada_por);
            if (usersMap.has(userId)) {
                prefactura.aprobada_por = usersMap.get(userId);
            }
        }

        if (prefactura.rechazada_por) {
            const userId = String(prefactura.rechazada_por);
            if (usersMap.has(userId)) {
                prefactura.rechazada_por = usersMap.get(userId);
            }
        }

        if (prefactura.enviada_por) {
            const userId = String(prefactura.enviada_por);
            if (usersMap.has(userId)) {
                prefactura.enviada_por = usersMap.get(userId);
            }
        }

        if (prefactura.historial_envios && Array.isArray(prefactura.historial_envios)) {
            prefactura.historial_envios.forEach((item: any) => {
                if (item.enviado_por) {
                    const userId = String(item.enviado_por);
                    if (usersMap.has(userId)) {
                        item.enviado_por = usersMap.get(userId);
                    }
                }
            });
        }

        return solicitud;
    }

    //* #========== PRIVATE METHODS ==========#

    /**
     * Calcular diferencia de horas entre fecha/hora_inicio y fecha_final/hora_final
     * Considera días completos entre las fechas
     * Formato esperado para horas: "HH:MM" o "HH:MM:SS"
     */
    private calculate_hours(
        fecha_inicio: Date, 
        hora_inicio: string, 
        fecha_final: Date, 
        hora_final: string
    ): number {
        try {
            // Parsear horas
            const [h1, m1] = hora_inicio.split(':').map(Number);
            const [h2, m2] = hora_final.split(':').map(Number);

            // Crear objetos Date completos con fecha y hora
            const inicio_completo = new Date(fecha_inicio);
            inicio_completo.setHours(h1, m1 || 0, 0, 0);

            const final_completo = new Date(fecha_final);
            final_completo.setHours(h2, m2 || 0, 0, 0);

            // Calcular diferencia en milisegundos
            const diff_ms = final_completo.getTime() - inicio_completo.getTime();

            // Convertir a horas
            const hours = diff_ms / (1000 * 60 * 60);

            // Redondear a 2 decimales
            return Math.round(hours * 100) / 100;
        } catch (error) {
            console.error("Error al calcular horas:", error);
            return 0;
        }
    }

    /**
     * Procesa un archivo Excel con gastos operacionales y los registra automáticamente
     * Formato Excel esperado:
     * - Columna A: Tipo de Gasto (fuel, tolls, repairs, fines, parking_lot)
     * - Columna B: Valor (número)
     * - Columna C: Descripción (texto)
     * - Columna D: Placa del Vehículo (texto)
     * 
     * @param solicitud_id ID de la solicitud
     * @param excelFile Archivo Excel subido
     * @param user_id ID del usuario que sube el archivo
     */
    public async process_operational_bills_excel({
        solicitud_id,
        excelFile,
        user_id
    }: {
        solicitud_id: string;
        excelFile: Express.Multer.File;
        user_id: string;
    }) {
        try {
            // Validar que la solicitud exista
            const solicitud = await solicitudModel.findById(solicitud_id);
            if (!solicitud) {
                throw new ResponseError(404, "Solicitud no encontrada");
            }

            // Leer el archivo Excel
            const workbook = XLSX.read(excelFile.buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];

            // Convertir a JSON
            const data = XLSX.utils.sheet_to_json(worksheet, { 
                header: ['tipo_gasto', 'valor', 'descripcion', 'placa'],
                defval: null,
                raw: false
            });

            // Validar que haya datos
            if (!data || data.length === 0) {
                throw new ResponseError(400, "El archivo Excel está vacío o no tiene datos válidos");
            }

            // Validar encabezados (primera fila puede ser encabezado)
            const firstRow = data[0] as any;
            const hasHeaders = firstRow.tipo_gasto && 
                (firstRow.tipo_gasto.toString().toLowerCase().includes('tipo') || 
                 firstRow.tipo_gasto.toString().toLowerCase().includes('gasto'));

            // Filtrar filas de encabezado y vacías
            const validRows = data.filter((row: any, index: number) => {
                if (index === 0 && hasHeaders) return false; // Saltar encabezado
                if (!row.tipo_gasto || !row.valor || !row.placa) return false; // Filas incompletas
                return true;
            });

            if (validRows.length === 0) {
                throw new ResponseError(400, "No se encontraron filas válidas con datos en el Excel");
            }

            // Tipos de gasto válidos
            const validTypes = ['fuel', 'tolls', 'repairs', 'fines', 'parking_lot'];

            // Agrupar gastos por placa (vehículo)
            const gastosPorPlaca: { [placa: string]: Array<{
                type_bill: "fuel" | "tolls" | "repairs" | "fines" | "parking_lot";
                value: number;
                description: string;
            }> } = {};

            // Procesar cada fila
            for (const row of validRows) {
                const rowData = row as { tipo_gasto?: any; valor?: any; descripcion?: any; placa?: any };
                const tipoGasto = String(rowData.tipo_gasto || '').trim().toLowerCase();
                const valorStr = String(rowData.valor || '').trim();
                const descripcion = String(rowData.descripcion || '').trim();
                const placa = String(rowData.placa || '').trim().toUpperCase();

                // Validar tipo de gasto
                if (!validTypes.includes(tipoGasto)) {
                    throw new ResponseError(400, `Tipo de gasto inválido: "${tipoGasto}". Valores válidos: ${validTypes.join(', ')}`);
                }

                // Validar y convertir valor
                const valor = parseFloat(valorStr);
                if (isNaN(valor) || valor <= 0) {
                    throw new ResponseError(400, `Valor inválido: "${valorStr}" en la fila con placa "${placa}"`);
                }

                // Validar placa
                if (!placa || placa.length === 0) {
                    throw new ResponseError(400, "Placa del vehículo es requerida");
                }

                // Agrupar por placa
                if (!gastosPorPlaca[placa]) {
                    gastosPorPlaca[placa] = [];
                }

                gastosPorPlaca[placa].push({
                    type_bill: tipoGasto as "fuel" | "tolls" | "repairs" | "fines" | "parking_lot",
                    value: valor,
                    description: descripcion
                });
            }

            // Buscar vehículos por placa y crear registros de gastos operacionales
            const resultados: Array<{
                placa: string;
                vehiculo_id?: string;
                gastos_registrados: number;
                error?: string;
            }> = [];

            for (const [placa, gastos] of Object.entries(gastosPorPlaca)) {
                try {
                    // Buscar vehículo por placa
                    const vehiculo = await vehicleModel.findOne({ placa: placa }).lean();
                    
                    if (!vehiculo) {
                        resultados.push({
                            placa,
                            gastos_registrados: 0,
                            error: `Vehículo con placa "${placa}" no encontrado`
                        });
                        continue;
                    }

                    const vehiculo_id = String(vehiculo._id);

                    // Crear registro de gastos operacionales usando el servicio de vehículos
                    const vehicleServices = new VehicleServices();
                    await vehicleServices.create_operational_bills({
                        vehicle_id: vehiculo_id,
                        user_id: user_id,
                        solicitud_id: solicitud_id,
                        bills: gastos.map(g => ({
                            type_bill: g.type_bill,
                            value: g.value,
                            description: g.description,
                            media_support: [] as Express.Multer.File[] // Sin archivos de soporte desde Excel
                        }))
                    });

                    resultados.push({
                        placa,
                        vehiculo_id,
                        gastos_registrados: gastos.length
                    });
                } catch (error) {
                    resultados.push({
                        placa,
                        gastos_registrados: 0,
                        error: error instanceof Error ? error.message : "Error desconocido"
                    });
                }
            }

            // Guardar auditoría de subida de operacionales
            const solicitudToUpdate = await solicitudModel.findById(solicitud_id);
            if (solicitudToUpdate && user_id) {
                (solicitudToUpdate as any).uploaded_operationals_by = user_id;
                (solicitudToUpdate as any).uploaded_operationals_at = new Date();
                (solicitudToUpdate as any).last_modified_by = user_id;
                await solicitudToUpdate.save();
            }

            // Recalcular liquidación automáticamente
            try {
                await this.calcular_liquidacion({ solicitud_id });
                await this.update_accounting_status_on_operational_upload({ solicitud_id });
            } catch (calcError) {
                console.error("Error al recalcular liquidación después de subir Excel:", calcError);
                // No lanzar error, solo loguear
            }

            // Verificar si hubo errores
            const errores = resultados.filter(r => r.error);
            const exitosos = resultados.filter(r => !r.error);

            return {
                message: `Procesamiento completado: ${exitosos.length} vehículo(s) procesado(s) exitosamente, ${errores.length} error(es)`,
                total_vehiculos: resultados.length,
                exitosos: exitosos.length,
                errores: errores.length,
                detalles: resultados
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, `Error al procesar archivo Excel: ${error instanceof Error ? error.message : 'Error desconocido'}`);
        }
    }

    /**
     * Exportar solicitudes a Excel
     * @param bitacora_id Opcional: si se proporciona, exporta solo las solicitudes de esa bitácora
     * @param filters Filtros opcionales para las solicitudes
     */
    public async export_solicitudes_to_excel({
        bitacora_id,
        filters = {}
    }: {
        bitacora_id?: string;
        filters?: {
            cliente_id?: string;
            conductor_id?: string;
            vehiculo_id?: string;
            status?: "pending" | "accepted" | "rejected";
            service_status?: "pendiente_de_asignacion" | "not-started" | "started" | "finished" | "sin_asignacion";
            empresa?: "travel" | "national";
            fecha_inicio?: Date;
            fecha_fin?: Date;
        };
    }): Promise<Buffer> {
        try {
            const query: any = {};

            // Si se proporciona bitacora_id, filtrar por esa bitácora
            if (bitacora_id) {
                query.bitacora_id = bitacora_id;
            }

            // Aplicar otros filtros
            if (filters.cliente_id) query.cliente = filters.cliente_id;
            if (filters.conductor_id) query.conductor = filters.conductor_id;
            if (filters.vehiculo_id) query.vehiculo_id = filters.vehiculo_id;
            if (filters.status) query.status = filters.status;
            if (filters.service_status) query.service_status = filters.service_status;
            if (filters.empresa) query.empresa = filters.empresa;

            // Filtro por rango de fechas
            if (filters.fecha_inicio || filters.fecha_fin) {
                query.fecha = {};
                if (filters.fecha_inicio) query.fecha.$gte = filters.fecha_inicio;
                if (filters.fecha_fin) query.fecha.$lte = filters.fecha_fin;
            }

            // Obtener todas las solicitudes (sin paginación para exportación)
            const solicitudes = await solicitudModel
                .find(query)
                .populate('cliente', 'name email documento_tipo documento_numero')
                .populate('vehiculo_id', 'placa type name')
                .populate('conductor', 'full_name document email')
                .populate('vehicle_assignments.vehiculo_id', 'placa type name')
                .populate('vehicle_assignments.conductor_id', 'full_name document email')
                .populate('created_by', 'full_name email')
                .populate('approved_by', 'full_name email')
                .populate('assigned_vehicles_by', 'full_name email')
                .populate('assigned_costs_by', 'full_name email')
                .populate('assigned_sales_by', 'full_name email')
                .populate('generated_prefactura_by', 'full_name email')
                .populate('generated_factura_by', 'full_name email')
                .sort({ created: -1 })
                .lean();

            // Preparar datos para Excel
            const excelData: any[] = [];

            // Encabezados
            excelData.push([
                'HE',
                'Empresa',
                'Fecha',
                'Fecha Final',
                'Hora Inicio',
                'Hora Final',
                'Total Horas',
                'Cliente',
                'Cliente Email',
                'Cliente Documento Tipo',
                'Cliente Documento Número',
                'Contacto',
                'Contacto Teléfono',
                'Origen',
                'Destino',
                'N° Pasajeros',
                'Placa',
                'Tipo Vehículo',
                'Conductor',
                'Conductor Teléfono',
                'Estado',
                'Estado Servicio',
                'Valor Cancelado',
                'Valor a Facturar',
                'Utilidad',
                '% Utilidad',
                'Total Gastos Operacionales',
                'N° Factura',
                'Fecha Factura',
                'N° Prefactura',
                'Fecha Prefactura',
                'Estado Prefactura',
                'Creado Por',
                'Fecha Creación',
                'Aprobado Por',
                'Fecha Aprobación',
                'Asignado Vehículos Por',
                'Fecha Asignación Vehículos',
                'Asignado Costos Por',
                'Fecha Asignación Costos',
                'Asignado Ventas Por',
                'Fecha Asignación Ventas',
                'Generado Prefactura Por',
                'Fecha Generación Prefactura',
                'Generado Factura Por',
                'Fecha Generación Factura'
            ]);

            // Procesar cada solicitud
            for (const solicitud of solicitudes) {
                const sol = solicitud as any;

                // Si tiene vehicle_assignments, crear una fila por cada vehículo
                if (sol.vehicle_assignments && sol.vehicle_assignments.length > 0) {
                    for (const assignment of sol.vehicle_assignments) {
                        excelData.push([
                            sol.he || '',
                            sol.empresa || '',
                            sol.fecha ? dayjs(sol.fecha).format('DD/MM/YYYY') : '',
                            sol.fecha_final ? dayjs(sol.fecha_final).format('DD/MM/YYYY') : '',
                            sol.hora_inicio || '',
                            sol.hora_final || '',
                            sol.total_horas || 0,
                            sol.cliente?.name || '',
                            sol.cliente?.email || '',
                            sol.cliente?.documento_tipo || '',
                            sol.cliente?.documento_numero || '',
                            sol.contacto || '',
                            sol.contacto_phone || '',
                            sol.origen || '',
                            sol.destino || '',
                            assignment.assigned_passengers || sol.n_pasajeros || 0,
                            assignment.placa || (assignment.vehiculo_id?.placa) || '',
                            assignment.vehiculo_id?.type || '',
                            assignment.conductor_id?.full_name || '',
                            assignment.conductor_phone || (assignment.conductor_id?.contact) || '',
                            sol.status || '',
                            sol.service_status || '',
                            sol.valor_cancelado || 0,
                            sol.valor_a_facturar || 0,
                            sol.utilidad || 0,
                            sol.porcentaje_utilidad || 0,
                            sol.total_gastos_operacionales || 0,
                            sol.n_factura || '',
                            sol.fecha_factura ? dayjs(sol.fecha_factura).format('DD/MM/YYYY') : '',
                            sol.prefactura?.numero || '',
                            sol.prefactura?.fecha ? dayjs(sol.prefactura.fecha).format('DD/MM/YYYY') : '',
                            sol.prefactura?.estado || '',
                            sol.created_by?.full_name || '',
                            sol.created ? dayjs(sol.created).format('DD/MM/YYYY HH:mm') : '',
                            sol.approved_by?.full_name || '',
                            sol.approved_at ? dayjs(sol.approved_at).format('DD/MM/YYYY HH:mm') : '',
                            sol.assigned_vehicles_by?.full_name || '',
                            sol.assigned_vehicles_at ? dayjs(sol.assigned_vehicles_at).format('DD/MM/YYYY HH:mm') : '',
                            sol.assigned_costs_by?.full_name || '',
                            sol.assigned_costs_at ? dayjs(sol.assigned_costs_at).format('DD/MM/YYYY HH:mm') : '',
                            sol.assigned_sales_by?.full_name || '',
                            sol.assigned_sales_at ? dayjs(sol.assigned_sales_at).format('DD/MM/YYYY HH:mm') : '',
                            sol.generated_prefactura_by?.full_name || '',
                            sol.generated_prefactura_at ? dayjs(sol.generated_prefactura_at).format('DD/MM/YYYY HH:mm') : '',
                            sol.generated_factura_by?.full_name || '',
                            sol.generated_factura_at ? dayjs(sol.generated_factura_at).format('DD/MM/YYYY HH:mm') : ''
                        ]);
                    }
                } else {
                    // Solicitud con un solo vehículo (campos individuales)
                    excelData.push([
                        sol.he || '',
                        sol.empresa || '',
                        sol.fecha ? dayjs(sol.fecha).format('DD/MM/YYYY') : '',
                        sol.fecha_final ? dayjs(sol.fecha_final).format('DD/MM/YYYY') : '',
                        sol.hora_inicio || '',
                        sol.hora_final || '',
                        sol.total_horas || 0,
                        sol.cliente?.name || '',
                        sol.cliente?.email || '',
                        sol.cliente?.documento_tipo || '',
                        sol.cliente?.documento_numero || '',
                        sol.contacto || '',
                        sol.contacto_phone || '',
                        sol.origen || '',
                        sol.destino || '',
                        sol.n_pasajeros || 0,
                        sol.placa || (sol.vehiculo_id?.placa) || '',
                        sol.tipo_vehiculo || (sol.vehiculo_id?.type) || '',
                        sol.conductor?.full_name || '',
                        sol.conductor_phone || (sol.conductor?.contact) || '',
                        sol.status || '',
                        sol.service_status || '',
                        sol.valor_cancelado || 0,
                        sol.valor_a_facturar || 0,
                        sol.utilidad || 0,
                        sol.porcentaje_utilidad || 0,
                        sol.total_gastos_operacionales || 0,
                        sol.n_factura || '',
                        sol.fecha_factura ? dayjs(sol.fecha_factura).format('DD/MM/YYYY') : '',
                        sol.prefactura?.numero || '',
                        sol.prefactura?.fecha ? dayjs(sol.prefactura.fecha).format('DD/MM/YYYY') : '',
                        sol.prefactura?.estado || '',
                        sol.created_by?.full_name || '',
                        sol.created ? dayjs(sol.created).format('DD/MM/YYYY HH:mm') : '',
                        sol.approved_by?.full_name || '',
                        sol.approved_at ? dayjs(sol.approved_at).format('DD/MM/YYYY HH:mm') : '',
                        sol.assigned_vehicles_by?.full_name || '',
                        sol.assigned_vehicles_at ? dayjs(sol.assigned_vehicles_at).format('DD/MM/YYYY HH:mm') : '',
                        sol.assigned_costs_by?.full_name || '',
                        sol.assigned_costs_at ? dayjs(sol.assigned_costs_at).format('DD/MM/YYYY HH:mm') : '',
                        sol.assigned_sales_by?.full_name || '',
                        sol.assigned_sales_at ? dayjs(sol.assigned_sales_at).format('DD/MM/YYYY HH:mm') : '',
                        sol.generated_prefactura_by?.full_name || '',
                        sol.generated_prefactura_at ? dayjs(sol.generated_prefactura_at).format('DD/MM/YYYY HH:mm') : '',
                        sol.generated_factura_by?.full_name || '',
                        sol.generated_factura_at ? dayjs(sol.generated_factura_at).format('DD/MM/YYYY HH:mm') : ''
                    ]);
                }
            }

            // Crear workbook
            const workbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.aoa_to_sheet(excelData);

            // Ajustar ancho de columnas
            worksheet['!cols'] = [
                { wch: 12 }, // HE
                { wch: 10 }, // Empresa
                { wch: 12 }, // Fecha
                { wch: 12 }, // Fecha Final
                { wch: 10 }, // Hora Inicio
                { wch: 10 }, // Hora Final
                { wch: 12 }, // Total Horas
                { wch: 25 }, // Cliente
                { wch: 25 }, // Cliente Email
                { wch: 15 }, // Cliente Documento Tipo
                { wch: 18 }, // Cliente Documento Número
                { wch: 20 }, // Contacto
                { wch: 15 }, // Contacto Teléfono
                { wch: 25 }, // Origen
                { wch: 25 }, // Destino
                { wch: 12 }, // N° Pasajeros
                { wch: 10 }, // Placa
                { wch: 15 }, // Tipo Vehículo
                { wch: 25 }, // Conductor
                { wch: 15 }, // Conductor Teléfono
                { wch: 12 }, // Estado
                { wch: 20 }, // Estado Servicio
                { wch: 15 }, // Valor Cancelado
                { wch: 15 }, // Valor a Facturar
                { wch: 12 }, // Utilidad
                { wch: 12 }, // % Utilidad
                { wch: 20 }, // Total Gastos Operacionales
                { wch: 15 }, // N° Factura
                { wch: 12 }, // Fecha Factura
                { wch: 15 }, // N° Prefactura
                { wch: 12 }, // Fecha Prefactura
                { wch: 15 }, // Estado Prefactura
                { wch: 20 }, // Creado Por
                { wch: 18 }, // Fecha Creación
                { wch: 20 }, // Aprobado Por
                { wch: 18 }, // Fecha Aprobación
                { wch: 20 }, // Asignado Vehículos Por
                { wch: 18 }, // Fecha Asignación Vehículos
                { wch: 20 }, // Asignado Costos Por
                { wch: 18 }, // Fecha Asignación Costos
                { wch: 20 }, // Asignado Ventas Por
                { wch: 18 }, // Fecha Asignación Ventas
                { wch: 20 }, // Generado Prefactura Por
                { wch: 18 }, // Fecha Generación Prefactura
                { wch: 20 }, // Generado Factura Por
                { wch: 18 }  // Fecha Generación Factura
            ];

            XLSX.utils.book_append_sheet(workbook, worksheet, 'Solicitudes');

            // Generar buffer
            const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

            return excelBuffer;
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, `Error al exportar solicitudes a Excel: ${error instanceof Error ? error.message : 'Error desconocido'}`);
        }
    }

    /**
     * Aprobar prefactura por el cliente
     * SOLO el cliente asociado a la solicitud puede aprobar la prefactura
     */
    public async client_approve_prefactura({
        solicitud_id,
        client_id,
        notas
    }: {
        solicitud_id: string;
        client_id: string;
        notas?: string;
    }) {
        try {
            const solicitud = await solicitudModel.findById(solicitud_id);
            if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada");

            // Validar que el cliente autenticado es el cliente asociado a la solicitud
            if (String(solicitud.cliente) !== String(client_id)) {
                throw new ResponseError(403, "No tiene permiso para aprobar esta prefactura. Solo el cliente asociado a la solicitud puede aprobarla.");
            }

            if (!(solicitud as any).prefactura?.numero) {
                throw new ResponseError(400, "No existe una prefactura generada para esta solicitud");
            }

            // Validar que la prefactura haya sido enviada al cliente
            if (!(solicitud as any).prefactura?.enviada_al_cliente) {
                throw new ResponseError(400, "La prefactura aún no ha sido enviada al cliente");
            }

            // Validar que no esté ya aprobada
            if ((solicitud as any).prefactura?.estado === "aceptada") {
                throw new ResponseError(400, "La prefactura ya fue aprobada");
            }

            // Aprobar prefactura
            (solicitud as any).prefactura.estado = "aceptada";
            (solicitud as any).prefactura.aprobada = true;
            (solicitud as any).prefactura.aprobada_por = client_id; // Guardar que el cliente la aprobó
            (solicitud as any).prefactura.aprobada_fecha = new Date();
            if (notas) {
                (solicitud as any).prefactura.notas = notas;
            }

            // Actualizar historial
            if (!(solicitud as any).prefactura.historial_envios) {
                (solicitud as any).prefactura.historial_envios = [];
            }
            (solicitud as any).prefactura.historial_envios.push({
                fecha: new Date(),
                estado: "aceptada",
                enviado_por: client_id,
                notas: notas || undefined
            });

            // Automáticamente marcar como listo para facturación
            (solicitud as any).accounting_status = "listo_para_facturacion";
            (solicitud as any).last_modified_by = client_id;

            await solicitud.save();

            // Populizar IDs de prefactura antes de retornar
            const solicitudObj = solicitud.toObject();
            await this.populate_prefactura_ids(solicitudObj);

            return {
                message: "Prefactura aprobada exitosamente",
                solicitud: solicitudObj
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "Error al aprobar prefactura");
        }
    }

    /**
     * Rechazar prefactura por el cliente
     * SOLO el cliente asociado a la solicitud puede rechazar la prefactura
     */
    public async client_reject_prefactura({
        solicitud_id,
        client_id,
        notas
    }: {
        solicitud_id: string;
        client_id: string;
        notas?: string;
    }) {
        try {
            const solicitud = await solicitudModel.findById(solicitud_id);
            if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada");

            // Validar que el cliente autenticado es el cliente asociado a la solicitud
            if (String(solicitud.cliente) !== String(client_id)) {
                throw new ResponseError(403, "No tiene permiso para rechazar esta prefactura. Solo el cliente asociado a la solicitud puede rechazarla.");
            }

            if (!(solicitud as any).prefactura?.numero) {
                throw new ResponseError(400, "No existe una prefactura generada para esta solicitud");
            }

            // Validar que la prefactura haya sido enviada al cliente
            if (!(solicitud as any).prefactura?.enviada_al_cliente) {
                throw new ResponseError(400, "La prefactura aún no ha sido enviada al cliente");
            }

            // Rechazar prefactura
            (solicitud as any).prefactura.estado = "rechazada";
            (solicitud as any).prefactura.aprobada = false;
            (solicitud as any).prefactura.rechazada_por = client_id;
            (solicitud as any).prefactura.rechazada_fecha = new Date();
            if (notas) {
                (solicitud as any).prefactura.notas = notas;
            }

            // Actualizar historial
            if (!(solicitud as any).prefactura.historial_envios) {
                (solicitud as any).prefactura.historial_envios = [];
            }
            (solicitud as any).prefactura.historial_envios.push({
                fecha: new Date(),
                estado: "rechazada",
                enviado_por: client_id,
                notas: notas || undefined
            });

            // Volver a estado de operacional completo para que se pueda regenerar la prefactura
            (solicitud as any).accounting_status = "operacional_completo";
            (solicitud as any).last_modified_by = client_id;

            await solicitud.save();

            // Populizar IDs de prefactura antes de retornar
            const solicitudObj = solicitud.toObject();
            await this.populate_prefactura_ids(solicitudObj);

            return {
                message: "Prefactura rechazada",
                solicitud: solicitudObj
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "Error al rechazar prefactura");
        }
    }
}