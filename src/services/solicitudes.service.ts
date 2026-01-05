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
            bitacora_id?: string, // Opcional: si no se proporciona, se busca automáticamente
            fecha: Date,
            hora_inicio: string,
            origen: string,
            destino: string,
            n_pasajeros: number,
            requested_passengers?: number,
            estimated_km?: number,
            estimated_hours?: number,
        }
    }) {
        try {
            // Obtener información del cliente
            const client = await SolicitudesService.ClientService.get_client_by_id({ id: client_id });
            if (!client) throw new ResponseError(404, "Cliente no encontrado");

            // Obtener o crear bitácora automáticamente basada en la fecha
            let bitacora_id: mongoose.Types.ObjectId;
            if (payload.bitacora_id) {
                // Si se proporciona bitacora_id, validar que existe
                if (!mongoose.Types.ObjectId.isValid(payload.bitacora_id)) {
                    throw new ResponseError(400, "ID de bitácora inválido");
                }
                const bitacora = await bitacoraModel.findById(payload.bitacora_id);
                if (!bitacora) {
                    throw new ResponseError(404, "Bitácora no encontrada");
                }
                bitacora_id = bitacora._id;
            } else {
                // Buscar o crear bitácora automáticamente
                const client_company_id = typeof client.company_id === 'object' 
                    ? (client.company_id as any)._id || client.company_id
                    : client.company_id;
                bitacora_id = await this.get_or_create_bitacora({
                    company_id: String(client_company_id),
                    fecha: payload.fecha
                });
            }

            const loc = await this.resolve_locations({
                company_id: String(client.company_id),
                origen: payload.origen,
                destino: payload.destino
            });

            // Crear la solicitud con status pending
            const new_solicitud = await solicitudModel.create({
                bitacora_id: bitacora_id,

                // Datos proporcionados por el cliente
                fecha: payload.fecha,
                hora_inicio: payload.hora_inicio,
                origen: payload.origen,
                destino: payload.destino,
                origen_location_id: loc.origen_location_id,
                destino_location_id: loc.destino_location_id,
                n_pasajeros: payload.n_pasajeros,
                requested_passengers: payload.requested_passengers,
                estimated_km: payload.estimated_km,
                estimated_hours: payload.estimated_hours,

                // Datos del cliente (auto-rellenados)
                cliente: client_id,
                contacto: (client.contacts && client.contacts.length > 0) ? client.contacts[0].name : client.name,

                // Campos vacíos/default que se llenarán después
                he: "",
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
                status: "pending", // Requiere aprobación
                service_status: "sin_asignacion" // Estado inicial: sin asignación de vehículo/conductor
            });

            await new_solicitud.save();

            // Enviar notificación al coordinador de nueva solicitud
            try {
                // Obtener coordinadores de la empresa del cliente
                const coordinators = await userModel.find({
                    company_id: client.company_id,
                    role: { $in: ['coordinador', 'comercia', 'admin', 'superadmon'] },
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
            he: string,
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
            placa: string, // Se usa placa en lugar de vehiculo_id
            conductor_id?: string, // Opcional: si no se proporciona, se usa el conductor principal del vehículo

            // Datos financieros (opcionales - el comercial los establecerá después)
            // valor_cancelado, valor_a_facturar, utilidad, porcentaje_utilidad removidos

            // Contrato (opcional)
            contract_id?: string,
            contract_charge_mode?: "within_contract" | "outside_contract" | "no_contract",
            contract_charge_amount?: number,
            pricing_mode?: "por_hora" | "por_kilometro" | "por_distancia" | "tarifa_amva" | "por_viaje" | "por_trayecto",
        }
    }) {
        try {
            // Obtener información del cliente
            const client = await SolicitudesService.ClientService.get_client_by_id({ id: payload.cliente_id });
            if (!client) throw new ResponseError(404, "Cliente no encontrado");

            const loc = await this.resolve_locations({
                company_id: String(client.company_id),
                origen: payload.origen,
                destino: payload.destino
            });

            // Si hay contrato, traer cobro/tarifas para estimación
            let pricing_rate: number | undefined = undefined;
            let pricing_mode: any = payload.pricing_mode;
            if (payload.contract_id) {
                const contrato = await contractModel.findById(payload.contract_id).select("cobro company_id").lean();
                if (contrato?.company_id && String(contrato.company_id) !== String(client.company_id)) {
                    throw new ResponseError(401, "El contrato no pertenece a la empresa del cliente");
                }
                const cobro: any = (contrato as any)?.cobro || {};
                if (!pricing_mode) pricing_mode = cobro.modo_default;
                if (pricing_mode && cobro && cobro[pricing_mode] != null) pricing_rate = Number(cobro[pricing_mode]);
            }
            const estimated_price = this.compute_estimated_price({
                pricing_mode,
                pricing_rate,
                estimated_hours: payload.estimated_hours,
                estimated_km: payload.estimated_km
            });

            // Buscar vehículo por placa - automáticamente trae conductor y propietario
            const vehicleData = await SolicitudesService.VehicleServices.get_vehicle_by_placa({ 
                placa: payload.placa,
                company_id: String(client.company_id)
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

            const vehicle = vehicleData.vehicle;

            // Crear la solicitud ya aceptada
            const new_solicitud = await solicitudModel.create({
                bitacora_id: payload.bitacora_id,

                // Información básica del servicio
                he: payload.he,
                empresa: payload.empresa,
                fecha: payload.fecha,
                hora_inicio: payload.hora_inicio,
                origen: payload.origen,
                destino: payload.destino,
                origen_location_id: loc.origen_location_id,
                destino_location_id: loc.destino_location_id,
                n_pasajeros: payload.n_pasajeros,
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
                vehiculo_id: (vehicle as any)._id,
                placa: vehicle.placa,
                tipo_vehiculo: vehicle.type,
                flota: vehicle.flota,
                conductor: target_driver_id,
                conductor_phone: conductor.contact?.phone || "",

                // Datos financieros (inicializados en 0, el comercial los establecerá después)
                valor_cancelado: 0,
                valor_a_facturar: 0,
                utilidad: 0,
                porcentaje_utilidad: 0,

                // Contrato (si aplica)
                contract_id: payload.contract_id || undefined,
                contract_charge_mode: payload.contract_charge_mode || "no_contract",
                contract_charge_amount: payload.contract_charge_amount || 0,

                // Campos financieros que se llenarán después
                doc_soporte: "",
                n_egreso: "",
                n_factura: "",

                // Metadata
                created_by: coordinator_id,
                status: "accepted", // Ya aprobado
                service_status: "not-started"
            });

            await new_solicitud.save();

            // Crear sección de pagos automáticamente con la información del vehículo asignado
            const paymentSectionService = new PaymentSectionService();
            await paymentSectionService.create_or_update_payment_section({
                solicitud_id: new_solicitud._id.toString(),
                company_id: String(client.company_id),
                vehicle_assignments: [{
                    vehiculo_id: (vehicle as any)._id.toString(),
                    placa: vehicle.placa,
                    conductor_id: target_driver_id,
                    flota: vehicle.flota
                }],
                created_by: coordinator_id
            });

            // Descontar presupuesto si aplica (contrato fijo/ocasional)
            // Nota: El cargo al contrato se hará después cuando el comercial establezca valor_a_facturar
            if (payload.contract_charge_mode === "within_contract") {
                if (!payload.contract_id) throw new ResponseError(400, "contract_id es requerido cuando contract_charge_mode = within_contract");
                
                // Solo cargar al contrato si se proporciona contract_charge_amount explícitamente
                // Si no, se cargará después cuando el comercial establezca valor_a_facturar
                if (payload.contract_charge_amount && payload.contract_charge_amount > 0) {
                    const amount = payload.contract_charge_amount;

                    await SolicitudesService.ContractsService.charge_contract({
                        contract_id: payload.contract_id,
                        company_id: String(client.company_id),
                        amount,
                        solicitud_id: new_solicitud._id.toString(),
                        created_by: coordinator_id,
                        notes: `Cargo automático por solicitud ${new_solicitud.he || new_solicitud._id.toString()}`
                    });

                    // Asegurar consistencia en la solicitud
                    new_solicitud.contract_charge_amount = amount as any;
                }

                new_solicitud.contract_id = payload.contract_id as any;
                new_solicitud.contract_charge_mode = "within_contract" as any;
                await new_solicitud.save();
            }

            // Enviar notificación al cliente de que su solicitud ha sido creada y aprobada
            try {
                const fecha_formatted = dayjs(payload.fecha).format('DD/MM/YYYY');
                await send_client_solicitud_approved({
                    client_name: (client.contacts && client.contacts.length > 0) ? client.contacts[0].name : client.name,
                    client_email: client.email,
                    fecha: fecha_formatted,
                    hora_inicio: payload.hora_inicio,
                    origen: payload.origen,
                    destino: payload.destino,
                    vehiculo_placa: vehicle.placa,
                    conductor_name: conductor.full_name
                });
            } catch (emailError) {
                console.log("Error al enviar email al cliente:", emailError);
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
            placa: string, // Ahora se usa placa en lugar de vehiculo_id
            conductor_id?: string, // Permite elegir conductor del listado del vehículo
            // Valores financieros removidos - el comercial los establecerá después
            requested_passengers?: number,
            estimated_km?: number,
            estimated_hours?: number,

            // Contrato (opcional)
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

            // Buscar vehículo por placa - automáticamente trae conductor y propietario
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

            // Asignar vehículo (automático desde la placa)
            solicitud.vehiculo_id = vehicleData.vehicle._id as any;
            solicitud.placa = vehicleData.vehicle.placa;
            solicitud.tipo_vehiculo = vehicleData.vehicle.type;
            solicitud.flota = vehicleData.vehicle.flota;

            // Asignar conductor (seleccionado o automático desde el vehículo)
            solicitud.conductor = target_driver_id as any;
            solicitud.conductor_phone = (conductor as any).contact?.phone || "";

            // Datos financieros NO se asignan aquí - el comercial los establecerá después
            // Se mantienen en 0 hasta que el comercial los defina

            // Contrato
            solicitud.contract_id = payload.contract_id as any;
            solicitud.contract_charge_mode = (payload.contract_charge_mode || "no_contract") as any;
            solicitud.contract_charge_amount = payload.contract_charge_amount || 0;

            // Estimar precio según contrato/tarifario
            let pricing_rate: number | undefined = undefined;
            let pricing_mode: any = payload.pricing_mode;
            if (payload.contract_id) {
                const contrato = await contractModel.findById(payload.contract_id).select("cobro company_id").lean();
                const cobro: any = (contrato as any)?.cobro || {};
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

            // Cambiar estado de "sin_asignacion" a "not-started" cuando se asigna vehículo
            if (solicitud.service_status === "sin_asignacion") {
                solicitud.service_status = "not-started";
            }

            await solicitud.save();

            // Crear o actualizar sección de pagos automáticamente
            const paymentSectionService = new PaymentSectionService();
            await paymentSectionService.create_or_update_payment_section({
                solicitud_id: solicitud._id.toString(),
                company_id: company_id || String((await SolicitudesService.ClientService.get_client_by_id({ id: String(solicitud.cliente) })).company_id),
                vehicle_assignments: [{
                    vehiculo_id: String(vehicleData.vehicle._id),
                    placa: vehicleData.vehicle.placa,
                    conductor_id: target_driver_id,
                    flota: vehicleData.vehicle.flota
                }],
                created_by: accepted_by
            });

            // Descontar presupuesto si aplica (solo si se proporciona contract_charge_amount)
            // Nota: El cargo al contrato se hará después cuando el comercial establezca valor_a_facturar
            if (payload.contract_charge_mode === "within_contract") {
                if (!payload.contract_id) throw new ResponseError(400, "contract_id es requerido cuando contract_charge_mode = within_contract");
                
                // Solo cargar al contrato si se proporciona contract_charge_amount explícitamente
                // Si no, se cargará después cuando el comercial establezca valor_a_facturar
                if (payload.contract_charge_amount && payload.contract_charge_amount > 0) {
                    const client_doc = await SolicitudesService.ClientService.get_client_by_id({ id: String(solicitud.cliente) });
                    await SolicitudesService.ContractsService.charge_contract({
                        contract_id: payload.contract_id,
                        company_id: String(client_doc.company_id),
                        amount: payload.contract_charge_amount,
                        solicitud_id: solicitud._id.toString(),
                        created_by: accepted_by || undefined,
                        notes: `Cargo automático por aceptación de solicitud ${solicitud.he || solicitud._id.toString()}`
                    });

                    solicitud.contract_charge_amount = payload.contract_charge_amount as any;
                }

                solicitud.contract_id = payload.contract_id as any;
                solicitud.contract_charge_mode = "within_contract" as any;
                await solicitud.save();
            }

            // Devolver solicitud con información completa del vehículo y conductor
            return {
                message: "Solicitud aceptada exitosamente",
                solicitud,
                vehiculo: vehicleData.vehicle,
                conductor,
                propietario: vehicleData.propietario
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
     */
    public async start_service({
        solicitud_id
    }: {
        solicitud_id: string
    }) {
        try {
            const solicitud = await solicitudModel.findById(solicitud_id);
            if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada");

            if (solicitud.status !== "accepted") {
                throw new ResponseError(400, "Solo se pueden iniciar solicitudes aceptadas");
            }

            if (solicitud.service_status !== "not-started") {
                throw new ResponseError(400, "El servicio ya fue iniciado");
            }

            solicitud.service_status = "started";
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
     * Establecer valores financieros (solo comercial)
     * El comercial establece valor_a_facturar y valor_a_pagar (valor_cancelado)
     * Automáticamente recalcula utilidad
     */
    public async set_financial_values_by_comercial({
        solicitud_id,
        payload,
        comercial_id
    }: {
        solicitud_id: string,
        comercial_id: string,
        payload: {
            valor_a_facturar: number,  // Valor a facturar al cliente
            valor_cancelado: number,    // Valor a pagar al transportador
        }
    }) {
        try {
            const solicitud = await solicitudModel.findById(solicitud_id);
            if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada");

            // Actualizar valores
            solicitud.valor_a_facturar = payload.valor_a_facturar;
            solicitud.valor_cancelado = payload.valor_cancelado;

            // Calcular utilidad automáticamente
            const total_gastos = (solicitud.total_gastos_operacionales || 0);
            const utilidad = payload.valor_a_facturar - payload.valor_cancelado - total_gastos;
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

            return {
                message: "Valores financieros establecidos exitosamente",
                solicitud: solicitud.toObject()
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudieron establecer los valores financieros");
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
                .lean();

            if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada");

            // Ocultar utilidades si es coordinador
            if (user_role === "coordinador") {
                delete (solicitud as any).utilidad;
                delete (solicitud as any).porcentaje_utilidad;
            }

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
            service_status?: "not-started" | "started" | "finished" | "sin_asignacion",
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
                .populate('vehiculo_id', 'placa type')
                .populate('conductor', 'name phone')
                .sort({ created: -1 })
                .skip(skip)
                .limit(limit)
                .lean();

            // Ocultar utilidades si es coordinador
            if (user_role === "coordinador") {
                solicitudes.forEach((solicitud: any) => {
                    delete solicitud.utilidad;
                    delete solicitud.porcentaje_utilidad;
                });
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