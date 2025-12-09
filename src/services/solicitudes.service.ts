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

export class SolicitudesService {
    private static ClientService = new ClientService()
    private static UserService = new UserService()
    private static CompanyService = new CompanyService()
    private static VehicleServices = new VehicleServices()

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
            n_pasajeros: number
        }
    }) {
        try {
            // Obtener información del cliente
            const client = await SolicitudesService.ClientService.get_client_by_id({ id: client_id });
            if (!client) throw new ResponseError(404, "Cliente no encontrado");

            // Crear la solicitud con status pending
            const new_solicitud = await solicitudModel.create({
                bitacora_id: payload.bitacora_id,

                // Datos proporcionados por el cliente
                fecha: payload.fecha,
                hora_inicio: payload.hora_inicio,
                origen: payload.origen,
                destino: payload.destino,
                n_pasajeros: payload.n_pasajeros,

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
                    role: { $in: ['coordinador', 'admin', 'superadmon'] },
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

            // Vehículo y conductor
            vehiculo_id: string,
            conductor_id: string,

            // Datos financieros
            nombre_cuenta_cobro: string,
            valor_cancelado: number,
            valor_a_facturar: number,
            utilidad: number,
            porcentaje_utilidad: number,
        }
    }) {
        try {
            // Obtener información del cliente
            const client = await SolicitudesService.ClientService.get_client_by_id({ id: payload.cliente_id });
            if (!client) throw new ResponseError(404, "Cliente no encontrado");

            // Obtener información del vehículo
            const vehicle = await SolicitudesService.VehicleServices.get_vehicle_by_id({ id: payload.vehiculo_id });
            if (!vehicle) throw new ResponseError(404, "Vehículo no encontrado");

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
                n_pasajeros: payload.n_pasajeros,

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
        payload
    }: {
        solicitud_id: string,
        company_id?: string,
        payload: {
            he: string,
            empresa: "travel" | "national",
            placa: string, // Ahora se usa placa en lugar de vehiculo_id
            nombre_cuenta_cobro: string,
            valor_cancelado: number,
            valor_a_facturar: number,
            utilidad: number,
            porcentaje_utilidad: number,
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

            if (!vehicleData.conductor) {
                throw new ResponseError(400, "El vehículo no tiene conductor asignado");
            }

            // Actualizar la solicitud
            solicitud.status = "accepted";
            solicitud.he = payload.he;
            solicitud.empresa = payload.empresa;

            // Asignar vehículo (automático desde la placa)
            solicitud.vehiculo_id = vehicleData.vehicle._id as any;
            solicitud.placa = vehicleData.vehicle.placa;
            solicitud.tipo_vehiculo = vehicleData.vehicle.type;
            solicitud.flota = vehicleData.vehicle.flota;

            // Asignar conductor (automático desde el vehículo)
            solicitud.conductor = vehicleData.conductor._id as any;
            solicitud.conductor_phone = vehicleData.conductor.phone || "";

            // Asignar datos financieros
            solicitud.nombre_cuenta_cobro = payload.nombre_cuenta_cobro;
            solicitud.valor_cancelado = payload.valor_cancelado;
            solicitud.valor_a_facturar = payload.valor_a_facturar;
            solicitud.utilidad = payload.utilidad;
            solicitud.porcentaje_utilidad = payload.porcentaje_utilidad;

            await solicitud.save();

            // Devolver solicitud con información completa del vehículo y conductor
            return {
                message: "Solicitud aceptada exitosamente",
                solicitud,
                vehiculo: vehicleData.vehicle,
                conductor: vehicleData.conductor,
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