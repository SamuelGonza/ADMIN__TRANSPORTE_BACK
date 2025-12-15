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
import fs from "fs";
import path from "path";
import { renderHtmlToPdfBuffer } from "@/utils/pdf";

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
        if (pricing_mode === "por_distancia" || pricing_mode === "tarifa_amva") {
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
     * Crear solicitud por parte del CLIENTE
     * Solo proporciona datos básicos del servicio
     * Status: pending (requiere aprobación del coordinador)
     */
    public async create_solicitud_by_client({
        client_id,
        payload
    }: {
        client_id: string,
        payload: {
            bitacora_id: string,
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

            const loc = await this.resolve_locations({
                company_id: String(client.company_id),
                origen: payload.origen,
                destino: payload.destino
            });

            // Crear la solicitud con status pending
            const new_solicitud = await solicitudModel.create({
                bitacora_id: payload.bitacora_id,

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
                contacto: client.contact_name,

                // Campos vacíos/default que se llenarán después
                he: "",
                empresa: "national", // default
                hora_final: "",
                total_horas: 0,
                novedades: "",

                // Vehículo y conductor (se asignarán al aceptar)
                vehiculo_id: null,
                placa: "",
                tipo_vehiculo: "",
                flota: "",
                conductor: null,
                conductor_phone: "",

                // Datos financieros (se llenarán al aceptar)
                nombre_cuenta_cobro: "",
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
                service_status: "not-started"
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
                        client_name: client.contact_name || client.name,
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
            vehiculo_id: string,
            conductor_id: string,

            // Datos financieros
            nombre_cuenta_cobro: string,
            valor_cancelado: number,
            valor_a_facturar: number,
            utilidad: number,
            porcentaje_utilidad: number,

            // Contrato (opcional)
            contract_id?: string,
            contract_charge_mode?: "within_contract" | "outside_contract" | "no_contract",
            contract_charge_amount?: number,
            pricing_mode?: "por_hora" | "por_kilometro" | "por_distancia" | "tarifa_amva",
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

            // Obtener información del vehículo
            const vehicle = await SolicitudesService.VehicleServices.get_vehicle_by_id({ id: payload.vehiculo_id });
            if (!vehicle) throw new ResponseError(404, "Vehículo no encontrado");

            // Validar que el conductor seleccionado esté permitido para el vehículo
            const driver_id = (vehicle as any).driver_id?._id ? String((vehicle as any).driver_id._id) : String((vehicle as any).driver_id);
            const possible_ids: string[] = Array.isArray((vehicle as any).possible_drivers)
                ? (vehicle as any).possible_drivers.map((d: any) => (d?._id ? String(d._id) : String(d)))
                : [];
            const allowed_driver_ids = new Set<string>([driver_id, ...possible_ids].filter(Boolean));
            if (!allowed_driver_ids.has(String(payload.conductor_id))) {
                throw new ResponseError(400, "El conductor seleccionado no está asociado a este vehículo");
            }

            // Obtener información del conductor
            const conductor = await SolicitudesService.UserService.get_user_by_id({ id: payload.conductor_id });
            if (!conductor) throw new ResponseError(404, "Conductor no encontrado");

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
                contacto: client.contact_name,

                // Campos que se llenarán al finalizar
                hora_final: "",
                total_horas: 0,
                novedades: "",

                // Vehículo y conductor (auto-rellenados desde los modelos)
                vehiculo_id: payload.vehiculo_id,
                placa: vehicle.placa,
                tipo_vehiculo: vehicle.type,
                flota: vehicle.flota,
                conductor: payload.conductor_id,
                conductor_phone: conductor.contact?.phone || "",

                // Datos financieros
                nombre_cuenta_cobro: payload.nombre_cuenta_cobro,
                valor_cancelado: payload.valor_cancelado,
                valor_a_facturar: payload.valor_a_facturar,
                utilidad: payload.utilidad,
                porcentaje_utilidad: payload.porcentaje_utilidad,

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

            // Descontar presupuesto si aplica (contrato fijo/ocasional)
            if (payload.contract_charge_mode === "within_contract") {
                if (!payload.contract_id) throw new ResponseError(400, "contract_id es requerido cuando contract_charge_mode = within_contract");
                const amount = payload.contract_charge_amount && payload.contract_charge_amount > 0
                    ? payload.contract_charge_amount
                    : payload.valor_a_facturar;

                await SolicitudesService.ContractsService.charge_contract({
                    contract_id: payload.contract_id,
                    company_id: String(client.company_id),
                    amount,
                    solicitud_id: new_solicitud._id.toString(),
                    created_by: coordinator_id,
                    notes: `Cargo automático por solicitud ${new_solicitud.he || new_solicitud._id.toString()}`
                });

                // Asegurar consistencia en la solicitud
                new_solicitud.contract_id = payload.contract_id as any;
                new_solicitud.contract_charge_mode = "within_contract" as any;
                new_solicitud.contract_charge_amount = amount as any;
                await new_solicitud.save();
            }

            // Enviar notificación al cliente de que su solicitud ha sido creada y aprobada
            try {
                const fecha_formatted = dayjs(payload.fecha).format('DD/MM/YYYY');
                await send_client_solicitud_approved({
                    client_name: client.contact_name || client.name,
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
            nombre_cuenta_cobro: string,
            valor_cancelado: number,
            valor_a_facturar: number,
            utilidad: number,
            porcentaje_utilidad: number,
            requested_passengers?: number,
            estimated_km?: number,
            estimated_hours?: number,

            // Contrato (opcional)
            contract_id?: string,
            contract_charge_mode?: "within_contract" | "outside_contract" | "no_contract",
            contract_charge_amount?: number,
            pricing_mode?: "por_hora" | "por_kilometro" | "por_distancia" | "tarifa_amva",
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

            // Asignar datos financieros
            solicitud.nombre_cuenta_cobro = payload.nombre_cuenta_cobro;
            solicitud.valor_cancelado = payload.valor_cancelado;
            solicitud.valor_a_facturar = payload.valor_a_facturar;
            solicitud.utilidad = payload.utilidad;
            solicitud.porcentaje_utilidad = payload.porcentaje_utilidad;

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

            await solicitud.save();

            // Descontar presupuesto si aplica
            if (payload.contract_charge_mode === "within_contract") {
                if (!payload.contract_id) throw new ResponseError(400, "contract_id es requerido cuando contract_charge_mode = within_contract");
                const amount = payload.contract_charge_amount && payload.contract_charge_amount > 0
                    ? payload.contract_charge_amount
                    : payload.valor_a_facturar;

                // buscar cliente para company_id correcto
                const client_doc = await SolicitudesService.ClientService.get_client_by_id({ id: String(solicitud.cliente) });
                await SolicitudesService.ContractsService.charge_contract({
                    contract_id: payload.contract_id,
                    company_id: String(client_doc.company_id),
                    amount,
                    solicitud_id: solicitud._id.toString(),
                    created_by: accepted_by || undefined,
                    notes: `Cargo automático por aceptación de solicitud ${solicitud.he || solicitud._id.toString()}`
                });

                solicitud.contract_id = payload.contract_id as any;
                solicitud.contract_charge_mode = "within_contract" as any;
                solicitud.contract_charge_amount = amount as any;
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
     * Actualizar datos financieros
     * Para ir completando información durante el proceso
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
        }
    }) {
        try {
            const solicitud = await solicitudModel.findById(solicitud_id);
            if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada");

            // Actualizar solo los campos proporcionados
            if (payload.doc_soporte !== undefined) solicitud.doc_soporte = payload.doc_soporte;
            if (payload.fecha_cancelado !== undefined) solicitud.fecha_cancelado = payload.fecha_cancelado;
            if (payload.n_egreso !== undefined) solicitud.n_egreso = payload.n_egreso;
            if (payload.n_factura !== undefined) solicitud.n_factura = payload.n_factura;
            if (payload.fecha_factura !== undefined) solicitud.fecha_factura = payload.fecha_factura;

            await solicitud.save();

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
     */
    public async get_solicitud_by_id({ id }: { id: string }) {
        try {
            const solicitud = await solicitudModel
                .findById(id)
                .populate('cliente', 'name email contact_name contact_phone')
                .populate('vehiculo_id', 'placa type flota seats')
                .populate('conductor', 'name phone email')
                .populate('created_by', 'name email')
                .lean();

            if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada");

            return solicitud;
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo obtener la solicitud");
        }
    }

    /**
     * Obtener todas las solicitudes con filtros y paginación
     */
    public async get_all_solicitudes({
        filters,
        page = 1,
        limit = 10
    }: {
        filters: {
            bitacora_id?: string,
            cliente_id?: string,
            conductor_id?: string,
            vehiculo_id?: string,
            status?: "pending" | "accepted" | "rejected",
            service_status?: "not-started" | "started" | "finished",
            empresa?: "travel" | "national",
            fecha_inicio?: Date,
            fecha_fin?: Date,
        },
        page?: number,
        limit?: number
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
                .populate('cliente', 'name email contact_name')
                .populate('vehiculo_id', 'placa type')
                .populate('conductor', 'name phone')
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
                .populate('cliente', 'name email contact_name contact_phone phone')
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
                .populate('cliente', 'name email contact_name contact_phone phone')
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