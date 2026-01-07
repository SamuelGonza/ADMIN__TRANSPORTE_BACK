import solicitudModel from '@/models/solicitud.model';
import { VehicleServices } from './vehicles.service';
import { CompanyService } from './company.service';
import { UserService } from './users.service';
import { ClientService } from "./client.service";
import { ResponseError } from '@/utils/errors';
import { BitacoraSolicitud } from '@/contracts/interfaces/bitacora.interface';
import { send_coordinator_new_solicitud, send_client_solicitud_approved } from '@/email/index.email';
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
    private async generate_next_he(company_id: string): Promise<string> {
        try {
            // Normalizar company_id a ObjectId
            const company_id_obj = new mongoose.Types.ObjectId(company_id);

            // Buscar todas las solicitudes de la compañía
            // Necesitamos obtener el company_id desde las bitácoras o desde el cliente
            // Primero, obtener todas las bitácoras de la compañía
            const bitacoras = await bitacoraModel.find({ company_id: company_id_obj }).select('_id').lean();
            const bitacora_ids = bitacoras.map(b => b._id);

            if (bitacora_ids.length === 0) {
                // Si no hay bitácoras, empezar desde 1
                return "1";
            }

            // Buscar la solicitud con el HE más alto (numérico)
            // El HE puede ser un string numérico, así que necesitamos convertirlo a número para comparar
            const solicitudes = await solicitudModel
                .find({ bitacora_id: { $in: bitacora_ids } })
                .select('he')
                .lean();

            if (!solicitudes || solicitudes.length === 0) {
                // Si no hay solicitudes, empezar desde 1
                return "1";
            }

            // Extraer números del HE y encontrar el máximo
            let maxHe = 0;
            for (const solicitud of solicitudes) {
                const he = (solicitud as any).he;
                if (he && typeof he === 'string') {
                    // Intentar extraer el número del string
                    const heNumber = parseInt(he, 10);
                    if (!isNaN(heNumber) && heNumber > maxHe) {
                        maxHe = heNumber;
                    }
                } else if (typeof he === 'number') {
                    if (he > maxHe) {
                        maxHe = he;
                    }
                }
            }

            // Incrementar y devolver como string
            return String(maxHe + 1);
        } catch (error) {
            console.error("Error al generar HE consecutivo:", error);
            // En caso de error, devolver un timestamp como fallback
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
     * Genera el PDF de manifiesto de pasajeros (1 vehículo).
     * - Header: empresa, placa, modelo, conductor, fecha expedición
     * - Body: tabla con N filas = asientos del vehículo
     * - Footer: firma del conductor
     */
    public async generate_passenger_manifest_pdf({
        solicitud_id
    }: {
        solicitud_id: string;
    }): Promise<{ filename: string; buffer: Buffer }> {
        try {
            const solicitud = await solicitudModel.findById(solicitud_id).lean();
            if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada");
            if (!(solicitud as any).vehiculo_id) throw new ResponseError(400, "La solicitud no tiene vehículo asignado");
            if (!(solicitud as any).conductor) throw new ResponseError(400, "La solicitud no tiene conductor asignado");

            // Vehículo con ficha y propietario
            const vehicle = await vehicleModel
                .findById((solicitud as any).vehiculo_id)
                .populate("owner_id.company_id", "company_name document logo")
                .lean();
            if (!vehicle) throw new ResponseError(404, "Vehículo no encontrado");

            // Empresa transportadora: preferir owner_id.company_id; si no, fallback a empresa del cliente
            let company: any = (vehicle as any).owner_id?.company_id || null;
            if (!company) {
                const client = await SolicitudesService.ClientService.get_client_by_id({ id: String((solicitud as any).cliente) });
                company = await companyModel.findById(String((client as any).company_id)).lean();
            }
            if (!company) throw new ResponseError(404, "No se pudo obtener la empresa transportadora");

            // Conductor
            const conductor = await userModel
                .findById((solicitud as any).conductor)
                .select("full_name document contact")
                .lean();
            if (!conductor) throw new ResponseError(404, "Conductor no encontrado");

            const seats = Number((vehicle as any).seats || 0);
            if (!seats || seats <= 0) throw new ResponseError(400, "El vehículo no tiene asientos definidos");

            const rowsHtml = Array.from({ length: seats }, (_, idx) => {
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

            const htmlTemplate = fs.readFileSync(this.resolveTemplatePath("manifiesto-pasajeros.html"), "utf8");
            const html = this.replaceVariables(htmlTemplate, {
                fecha_expedicion: fechaExpedicion,
                company_name: company.company_name || "",
                company_nit: nit,
                company_logo_url: company.logo?.url || "",
                vehiculo_placa: (vehicle as any).placa || "",
                vehiculo_interno: interno || "",
                vehiculo_modelo: String(modelo),
                vehiculo_seats: String(seats),
                conductor_nombre: conductor.full_name || "",
                conductor_documento: conductor?.document?.number ? String(conductor.document.number) : "",
                conductor_telefono: conductor?.contact?.phone || "",
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
            hora_inicio: string,
            origen: string,
            destino: string,
            n_pasajeros: number,
            contacto?: string, // Opcional: nombre del contacto (si no se proporciona, se usa el del cliente)
            contacto_phone?: string, // Opcional: número de teléfono del contacto
            requested_passengers?: number,
            estimated_km?: number,
            estimated_hours?: number,
        }
    }) {
        try {
            // Validar fecha y hora
            const fechaServicio = dayjs(payload.fecha);
            const fechaActual = dayjs().startOf('day');
            
            // Validar que la fecha no sea menor al día actual
            if (fechaServicio.isBefore(fechaActual, 'day')) {
                throw new ResponseError(400, "La fecha del servicio no puede ser menor al día actual");
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

            // Generar consecutivo HE automáticamente
            const next_he = await this.generate_next_he(client_company_id_str);

            // Crear la solicitud con status pending
            const new_solicitud = await solicitudModel.create({
                bitacora_id: bitacora_id,

                // Datos proporcionados por el cliente
                fecha: fechaNormalizada,
                hora_inicio: payload.hora_inicio,
                origen: payload.origen,
                destino: payload.destino,
                origen_location_id: loc.origen_location_id,
                destino_location_id: loc.destino_location_id,
                n_pasajeros: payload.n_pasajeros,
                requested_passengers: payload.requested_passengers,
                estimated_km: payload.estimated_km,
                estimated_hours: payload.estimated_hours,

                // Datos del cliente (auto-rellenados, pero el cliente puede cambiar contacto y contacto_phone)
                cliente: client_id,
                contacto: payload.contacto || ((client.contacts && client.contacts.length > 0) ? client.contacts[0].name : client.name),
                contacto_phone: payload.contacto_phone || ((client.contacts && client.contacts.length > 0) ? client.contacts[0].phone : client.phone || ""),

                // Campos vacíos/default que se llenarán después
                he: next_he, // Generado automáticamente
                empresa: "national", // default
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
                        client_name: (client.contacts && client.contacts.length > 0) ? client.contacts[0].name : client.name,
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
            empresa: "travel" | "national",
            fecha: Date,
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
            const fechaActual = dayjs().startOf('day');
            
            // Validar que la fecha no sea menor al día actual
            if (fechaServicio.isBefore(fechaActual, 'day')) {
                throw new ResponseError(400, "La fecha del servicio no puede ser menor al día actual");
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
            const next_he = await this.generate_next_he(client_company_id_str);

            // Normalizar fecha para evitar problemas de timezone
            const fechaNormalizada = dayjs(payload.fecha).startOf('day').toDate();

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
            he: string,
            empresa: "travel" | "national",
            placa: string, // Ahora se usa placa en lugar de vehiculo_id (para compatibilidad)
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
            solicitud.he = payload.he;
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

            // Guardar quién hizo la última modificación
            if (accepted_by) {
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
            throw new ResponseError(500, "No se pudo aceptar la solicitud");
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

            // Buscar todos los vehículos de la compañía (propios, afiliados, externos)
            const vehicleQuery: any = {
                $or: [
                    { "owner_id.type": "Company", "owner_id.company_id": company_id },
                    { "owner_id.type": "User", "owner_id.company_id": company_id },
                ]
            };
            if (vehicle_type) vehicleQuery.type = vehicle_type;

            const vehicles = await vehicleModel
                .find(vehicleQuery)
                .select("_id placa seats type flota driver_id possible_drivers n_numero_interno owner_id")
                .populate("driver_id", "full_name contact.phone")
                .populate("possible_drivers", "full_name contact.phone")
                .lean();

            if (!vehicles || vehicles.length === 0) {
                throw new ResponseError(404, "No hay vehículos disponibles");
            }

            // Convertir fecha a formato para comparación (solo fecha, sin hora)
            const fechaComparacion = new Date(fecha);
            fechaComparacion.setHours(0, 0, 0, 0);
            const fechaFinComparacion = new Date(fechaComparacion);
            fechaFinComparacion.setHours(23, 59, 59, 999);

            // Función para convertir hora string a minutos desde medianoche
            const horaAMinutos = (hora: string): number => {
                const [horas, minutos] = hora.split(':').map(Number);
                return horas * 60 + (minutos || 0);
            };

            const horaInicioMinutos = horaAMinutos(hora_inicio);

            // Verificar disponibilidad de cada vehículo
            const vehiclesWithAvailability = await Promise.all(
                vehicles.map(async (vehicle: any) => {
                    // Buscar solicitudes activas para este vehículo en la fecha
                    // Considerar tanto vehiculo_id principal como vehicle_assignments
                    const solicitudesActivas = await solicitudModel.find({
                        $or: [
                            { vehiculo_id: vehicle._id },
                            { "vehicle_assignments.vehiculo_id": vehicle._id }
                        ],
                        fecha: {
                            $gte: fechaComparacion,
                            $lte: fechaFinComparacion
                        },
                        status: { $ne: "rejected" }, // No considerar rechazadas
                        service_status: { $ne: "finished" } // No considerar finalizadas
                    }).select("hora_inicio hora_final total_horas fecha vehicle_assignments").lean();

                    let isInService = false;
                    let conflictingService: any = null;

                    // Verificar si hay solapamiento de horarios
                    for (const solicitud of solicitudesActivas) {
                        const solHoraInicio = horaAMinutos(solicitud.hora_inicio || "00:00");
                        let solHoraFin: number;
                        let horaFinalStr: string;

                        if (solicitud.hora_final && solicitud.hora_final.trim() !== "") {
                            // Si hay hora_final, usarla
                            solHoraFin = horaAMinutos(solicitud.hora_final);
                            horaFinalStr = solicitud.hora_final;
                        } else {
                            // Si no, calcular basándose en total_horas
                            const solTotalHoras = solicitud.total_horas || 0;
                            solHoraFin = solHoraInicio + (solTotalHoras * 60);
                            const horasFin = Math.floor(solHoraFin / 60);
                            const minutosFin = solHoraFin % 60;
                            horaFinalStr = `${horasFin.toString().padStart(2, '0')}:${minutosFin.toString().padStart(2, '0')}`;
                        }

                        // Si la hora solicitada está dentro del rango del servicio existente
                        if (horaInicioMinutos >= solHoraInicio && horaInicioMinutos < solHoraFin) {
                            isInService = true;
                            conflictingService = {
                                hora_inicio: solicitud.hora_inicio,
                                hora_final: horaFinalStr,
                                fecha: solicitud.fecha
                            };
                            break;
                        }
                    }

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
                        is_available: !isInService,
                        is_in_service: isInService,
                        conflicting_service: conflictingService,
                        flota_priority: flotaPriority,
                        driver: vehicle.driver_id ? {
                            _id: String((vehicle.driver_id as any)._id || vehicle.driver_id),
                            full_name: (vehicle.driver_id as any).full_name || "",
                            phone: (vehicle.driver_id as any).contact?.phone || ""
                        } : null,
                        possible_drivers: Array.isArray(vehicle.possible_drivers) 
                            ? vehicle.possible_drivers
                                .filter(Boolean)
                                .map((d: any) => ({
                                    _id: String(d._id || d),
                                    full_name: d.full_name || "",
                                    phone: d.contact?.phone || ""
                                }))
                            : []
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

            // Calcular distribución de pasajeros usando solo vehículos disponibles
            const distribution: Array<{
                vehiculo: any;
                seats: number;
                assigned_passengers: number;
                is_available: boolean;
                is_in_service: boolean;
                conflicting_service?: any;
            }> = [];

            let remaining = requested_passengers;
            for (const vehicle of availableVehicles) {
                if (remaining <= 0) break;
                if (vehicle.seats <= 0) continue;

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
                    message: `Este vehículo está en servicio el ${new Date(v.conflicting_service?.fecha || fecha).toLocaleDateString('es-ES')} de ${v.conflicting_service?.hora_inicio} a ${v.conflicting_service?.hora_final}. Puedes seleccionarlo para una fecha u hora posterior.`,
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

            // Calcular total de horas (simplificado - puedes mejorar esto)
            const total_horas = this.calculate_hours(solicitud.hora_inicio, payload.hora_final);

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

            // Calcular utilidad automáticamente si ya hay costos establecidos
            const total_gastos = (solicitud.total_gastos_operacionales || 0);
            const valor_cancelado = solicitud.valor_cancelado || 0;
            const utilidad = payload.valor_a_facturar - valor_cancelado - total_gastos;
            const porcentaje_utilidad = payload.valor_a_facturar > 0 
                ? (utilidad / payload.valor_a_facturar) * 100 
                : 0;

            solicitud.utilidad = utilidad;
            solicitud.porcentaje_utilidad = porcentaje_utilidad;

            // Guardar quién hizo la última modificación
            (solicitud as any).last_modified_by = comercial_id;

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
                .populate('conductor', 'name phone email')
                .populate('vehicle_assignments.vehiculo_id', 'placa type flota seats')
                .populate('vehicle_assignments.conductor_id', 'name phone email')
                .sort({ created: -1 })
                .skip(skip)
                .limit(limit)
                .lean();

            // Transformar solicitudes: si vehicle_assignments está vacío pero hay datos individuales, crear vehicle_assignments
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
                        conductor_id: sol.conductor || null,
                        conductor_phone: sol.conductor_phone || (sol.conductor?.phone) || "",
                        contract_id: sol.contract_id || null,
                        contract_charge_mode: sol.contract_charge_mode || "no_contract",
                        contract_charge_amount: sol.contract_charge_amount || 0,
                        accounting: sol.vehicle_assignments?.[0]?.accounting || {}
                    }];
                } else if (sol.vehicle_assignments && sol.vehicle_assignments.length > 0) {
                    // Asegurar que los campos populados estén correctamente estructurados
                    for (const assignment of sol.vehicle_assignments) {
                        if (assignment.vehiculo_id && typeof assignment.vehiculo_id === 'object') {
                            // Ya está populado, no hacer nada
                        } else if (assignment.vehiculo_id) {
                            // Si es solo un ID, mantenerlo (ya se populó arriba)
                        }
                        if (assignment.conductor_id && typeof assignment.conductor_id === 'object') {
                            // Ya está populado, no hacer nada
                        }
                    }
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
                .populate('conductor', 'full_name contact')
                .sort({ created: -1 })
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
                .populate('conductor', 'full_name contact avatar')
                .lean();

            if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada o no tienes acceso");

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
     * Generar prefactura para una solicitud
     * Requiere que todos los vehículos tengan operacional subido
     */
    public async generate_prefactura({
        solicitud_id,
        prefactura_numero,
        user_id
    }: {
        solicitud_id: string;
        prefactura_numero: string;
        user_id: string;
    }) {
        try {
            const solicitud = await solicitudModel.findById(solicitud_id);
            if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada");

            // Validar que la solicitud esté lista para contabilidad
            if (!solicitud.valor_a_facturar || solicitud.valor_a_facturar <= 0) {
                throw new ResponseError(400, "La solicitud no tiene valores de venta definidos");
            }

            if (!solicitud.valor_cancelado || solicitud.valor_cancelado <= 0) {
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

            // Generar prefactura
            (solicitud as any).prefactura = {
                numero: prefactura_numero,
                fecha: new Date(),
                aprobada: false,
                estado: "pendiente",
                enviada_al_cliente: false,
                historial_envios: []
            };

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
     * Aprobar prefactura
     */
    public async approve_prefactura({
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

            if ((solicitud as any).prefactura.aprobada) {
                throw new ResponseError(400, "La prefactura ya fue aprobada");
            }

            // Aprobar prefactura
            (solicitud as any).prefactura.aprobada = true;
            (solicitud as any).prefactura.aprobada_por = user_id;
            (solicitud as any).prefactura.aprobada_fecha = new Date();
            if (notas) {
                (solicitud as any).prefactura.notas = notas;
            }

            (solicitud as any).accounting_status = "prefactura_aprobada";
            (solicitud as any).last_modified_by = user_id;

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
     * Acepta la prefactura y la envía al cliente
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
            const solicitud = await solicitudModel.findById(solicitud_id);
            if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada");

            // Validar que la prefactura esté aprobada o lista para facturación
            const accountingStatus = (solicitud as any).accounting_status;
            if (accountingStatus !== "prefactura_aprobada" && accountingStatus !== "listo_para_facturacion") {
                throw new ResponseError(400, "La prefactura debe estar aprobada antes de enviarla al cliente");
            }

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

            // Actualizar estado a aceptada
            (solicitud as any).prefactura.estado = "aceptada";
            (solicitud as any).prefactura.enviada_al_cliente = true;
            (solicitud as any).prefactura.fecha_envio_cliente = new Date();
            (solicitud as any).prefactura.enviada_por = user_id;

            // Agregar entrada al historial
            (solicitud as any).prefactura.historial_envios.push({
                fecha: new Date(),
                estado: "aceptada",
                enviado_por: user_id,
                notas: notas || undefined
            });

            (solicitud as any).last_modified_by = user_id;

            await solicitud.save();

            // Populizar IDs de prefactura antes de retornar
            const solicitudObj = solicitud.toObject();
            await this.populate_prefactura_ids(solicitudObj);

            return {
                message: "Prefactura enviada al cliente exitosamente",
                solicitud: solicitudObj
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "Error al enviar prefactura al cliente");
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
     * Enviar correos cuando la solicitud está completamente rellenada
     * Envía al cliente: hoja de vida del conductor, ficha técnica de vehículos, información de solicitud (PDFs)
     * Envía al conductor: información de solicitud y manifiesto de pasajeros (PDF)
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
                .lean();

            if (!solicitud) return;
            if (!(solicitud as any).vehiculo_id || !(solicitud as any).conductor) return; // No está completamente rellenada

            const client = (solicitud as any).cliente;
            const conductor = (solicitud as any).conductor;
            const vehicle = (solicitud as any).vehiculo_id;

            if (!client || !conductor || !vehicle) return;

            // Obtener emails
            const clientEmail = client.email || (client.contacts && client.contacts.length > 0 ? client.contacts[0].email : null);
            const driverEmail = (conductor as any).email;

            if (!clientEmail && !driverEmail) return; // No hay emails para enviar

            // Generar PDFs
            const { send_client_solicitud_complete, send_driver_solicitud_complete } = await import('@/email/index.email');
            const { UserService } = await import('@/services/users.service');
            const { VehicleServices } = await import('@/services/vehicles.service');

            const userService = new UserService();
            const vehicleService = new VehicleServices();

            // Generar hoja de vida del conductor
            const driverCvPdf = await userService.generate_driver_technical_sheet_pdf({
                driver_id: String((solicitud as any).conductor)
            });

            // Generar ficha técnica del vehículo
            const vehicleTechnicalSheetPdf = await vehicleService.generate_vehicle_technical_sheet_pdf({
                vehicle_id: String((solicitud as any).vehiculo_id)
            });

            // Generar manifiesto de pasajeros
            const passengerManifestPdf = await this.generate_passenger_manifest_pdf({
                solicitud_id
            });

            // Generar PDF de información de solicitud (simplificado - puedes mejorarlo)
            const solicitudInfoPdf = await this.generate_solicitud_info_pdf({
                solicitud_id
            });

            // Preparar información de solicitud
            const fechaFormatted = dayjs((solicitud as any).fecha).format('DD/MM/YYYY');
            const clientName = (client.contacts && client.contacts.length > 0) ? client.contacts[0].name : client.name;

            // Enviar correo al cliente
            if (clientEmail) {
                await send_client_solicitud_complete({
                    client_name: clientName,
                    client_email: clientEmail,
                    solicitud_info: {
                        fecha: fechaFormatted,
                        hora_inicio: (solicitud as any).hora_inicio,
                        origen: (solicitud as any).origen,
                        destino: (solicitud as any).destino,
                        n_pasajeros: (solicitud as any).n_pasajeros || 0,
                        vehiculo_placa: vehicle.placa || "",
                        conductor_name: (conductor as any).full_name || ""
                    },
                    driver_cv_pdf: driverCvPdf,
                    vehicle_technical_sheets_pdf: [vehicleTechnicalSheetPdf],
                    solicitud_info_pdf: solicitudInfoPdf
                });
            }

            // Enviar correo al conductor
            if (driverEmail) {
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
                    passenger_manifest_pdf: passengerManifestPdf
                });
            }
        } catch (error) {
            console.error("Error al enviar correos de solicitud completa:", error);
            // No lanzar error, solo loguear
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
                .lean();

            if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada");

            const client = (solicitud as any).cliente;
            const conductor = (solicitud as any).conductor;
            const vehicle = (solicitud as any).vehiculo_id;

            const fechaExpedicion = dayjs(new Date()).format("DD/MM/YYYY HH:mm");
            const fechaServicio = dayjs((solicitud as any).fecha).format('DD/MM/YYYY');

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
                        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
                        th { background-color: #f2f2f2; }
                    </style>
                </head>
                <body>
                    <h1>Información de Solicitud de Servicio</h1>
                    <p><strong>Fecha de Expedición:</strong> ${fechaExpedicion}</p>
                    <table>
                        <tr><th>Campo</th><th>Valor</th></tr>
                        <tr><td>HE</td><td>${(solicitud as any).he || 'N/A'}</td></tr>
                        <tr><td>Fecha del Servicio</td><td>${fechaServicio}</td></tr>
                        <tr><td>Hora de Inicio</td><td>${(solicitud as any).hora_inicio || 'N/A'}</td></tr>
                        <tr><td>Origen</td><td>${(solicitud as any).origen || 'N/A'}</td></tr>
                        <tr><td>Destino</td><td>${(solicitud as any).destino || 'N/A'}</td></tr>
                        <tr><td>N° Pasajeros</td><td>${(solicitud as any).n_pasajeros || 0}</td></tr>
                        <tr><td>Cliente</td><td>${(client.contacts && client.contacts.length > 0) ? client.contacts[0].name : client.name}</td></tr>
                        <tr><td>Contacto</td><td>${(solicitud as any).contacto || 'N/A'}</td></tr>
                        <tr><td>Teléfono Contacto</td><td>${(solicitud as any).contacto_phone || 'N/A'}</td></tr>
                        <tr><td>Vehículo</td><td>${vehicle?.placa || 'N/A'}</td></tr>
                        <tr><td>Tipo Vehículo</td><td>${vehicle?.type || 'N/A'}</td></tr>
                        <tr><td>Conductor</td><td>${(conductor as any)?.full_name || 'N/A'}</td></tr>
                        ${(solicitud as any).novedades ? `<tr><td>Novedades</td><td>${(solicitud as any).novedades}</td></tr>` : ''}
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
     * Calcular diferencia de horas entre hora_inicio y hora_final
     * Formato esperado: "HH:MM" o "HH:MM:SS"
     */
    private calculate_hours(hora_inicio: string, hora_final: string): number {
        try {
            const [h1, m1] = hora_inicio.split(':').map(Number);
            const [h2, m2] = hora_final.split(':').map(Number);

            const inicio = h1 * 60 + m1;
            const final = h2 * 60 + m2;

            const diff_minutes = final - inicio;
            const hours = diff_minutes / 60;

            return Math.round(hours * 100) / 100; // Redondear a 2 decimales
        } catch (error) {
            return 0;
        }
    }
}