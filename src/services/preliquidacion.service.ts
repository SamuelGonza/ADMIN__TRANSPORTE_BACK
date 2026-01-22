import { ResponseError } from "@/utils/errors";
import solicitudModel from "@/models/solicitud.model";
import preliquidacionModel from "@/models/preliquidacion.model";
import vhc_operationalModel from "@/models/vhc_operational.model";
import vhc_preoperationalModel from "@/models/vhc_preoperational.model";
import vehicleModel from "@/models/vehicle.model";
import userModel from "@/models/user.model";
import dayjs from "dayjs";
import { renderHtmlToPdfBuffer } from "@/utils/pdf";
import fs from "fs";
import path from "path";

export class PreliquidacionService {
    
    /**
     * Limpia el nombre del cliente para usarlo en el número de preliquidación
     * Elimina espacios, caracteres especiales y convierte a mayúsculas
     */
    private cleanClientNameForPreliquidacion(name: string): string {
        return name
            .trim()
            .toUpperCase()
            .replace(/\s+/g, '_') // Reemplazar espacios con guión bajo
            .replace(/[^A-Z0-9_]/g, '') // Eliminar caracteres especiales excepto guión bajo
            .replace(/_+/g, '_') // Reemplazar múltiples guiones bajos con uno solo
            .replace(/^_|_$/g, ''); // Eliminar guiones bajos al inicio y final
    }

    /**
     * Generar preliquidación en masa
     * Calcula: (suma total_a_pagar de solicitudes) - (suma gastos Op + PreOp)
     */
    public async generate_preliquidacion({
        solicitudes_ids,
        gastos_operacionales_ids,
        gastos_preoperacionales_ids,
        user_id,
        company_id
    }: {
        solicitudes_ids: string[];
        gastos_operacionales_ids: string[];
        gastos_preoperacionales_ids: string[];
        user_id: string;
        company_id: string;
    }) {
        try {
            // Validaciones básicas
            if (!solicitudes_ids || solicitudes_ids.length === 0) {
                throw new ResponseError(400, "Debe proporcionar al menos una solicitud");
            }

            // Obtener todas las solicitudes con cliente, vehículos y propietarios
            const solicitudes = await solicitudModel.find({
                _id: { $in: solicitudes_ids }
            })
            .populate({
                path: 'cliente',
                select: 'name company_id',
                populate: {
                    path: 'company_id',
                    select: '_id'
                }
            })
            .populate({
                path: 'vehiculo_id',
                select: 'placa flota owner_id',
                populate: [
                    {
                        path: 'owner_id.company_id',
                        select: '_id company_name'
                    },
                    {
                        path: 'owner_id.user_id',
                        select: '_id full_name company_id',
                        populate: {
                            path: 'company_id',
                            select: '_id'
                        }
                    }
                ]
            })
            .populate({
                path: 'vehicle_assignments.vehiculo_id',
                select: 'placa flota owner_id',
                populate: [
                    {
                        path: 'owner_id.company_id',
                        select: '_id company_name'
                    },
                    {
                        path: 'owner_id.user_id',
                        select: '_id full_name company_id',
                        populate: {
                            path: 'company_id',
                            select: '_id'
                        }
                    }
                ]
            })
            .lean();

            // Validar que todas las solicitudes existan
            if (solicitudes.length !== solicitudes_ids.length) {
                const encontradas = solicitudes.map(s => s._id.toString());
                const noEncontradas = solicitudes_ids.filter(id => !encontradas.includes(id));
                throw new ResponseError(404, `Las siguientes solicitudes no fueron encontradas: ${noEncontradas.join(", ")}`);
            }

            // Validar que todas las solicitudes estén facturadas
            const solicitudesNoFacturadas = solicitudes.filter(s => 
                (s as any).accounting_status !== "facturado"
            );
            if (solicitudesNoFacturadas.length > 0) {
                const hesNoFacturadas = solicitudesNoFacturadas.map(s => s.he).join(", ");
                throw new ResponseError(400, `Las siguientes solicitudes no están facturadas: ${hesNoFacturadas}`);
            }

            // Validar que todas pertenezcan al mismo cliente
            const clienteIds = solicitudes.map(s => {
                const cliente = (s as any).cliente;
                return cliente?._id?.toString() || cliente?.toString();
            });
            const clienteUnico = [...new Set(clienteIds)];
            if (clienteUnico.length > 1) {
                throw new ResponseError(400, "Todas las solicitudes deben pertenecer al mismo cliente");
            }

            const primeraSolicitud = solicitudes[0];
            const cliente = (primeraSolicitud as any).cliente;
            
            if (!cliente || !cliente.name) {
                throw new ResponseError(400, "No se puede generar la preliquidación: las solicitudes no tienen cliente asociado");
            }

            // Obtener todos los vehículos de las solicitudes y validar que sean afiliados o externos
            const vehicleIds: string[] = [];
            const vehicles: any[] = [];

            for (const solicitud of solicitudes) {
                // Caso 1: Vehículo único (vehiculo_id)
                if ((solicitud as any).vehiculo_id) {
                    const vehicleId = typeof (solicitud as any).vehiculo_id === 'string' 
                        ? (solicitud as any).vehiculo_id 
                        : String((solicitud as any).vehiculo_id._id || (solicitud as any).vehiculo_id);
                    
                    if (!vehicleIds.includes(vehicleId)) {
                        vehicleIds.push(vehicleId);
                        const vehicle = (solicitud as any).vehiculo_id;
                        if (vehicle && typeof vehicle === 'object') {
                            vehicles.push(vehicle);
                        }
                    }
                }

                // Caso 2: Multi-vehículo (vehicle_assignments)
                if ((solicitud as any).vehicle_assignments && Array.isArray((solicitud as any).vehicle_assignments)) {
                    for (const assignment of (solicitud as any).vehicle_assignments) {
                        if (assignment.vehiculo_id) {
                            const vehicleId = typeof assignment.vehiculo_id === 'string'
                                ? assignment.vehiculo_id
                                : String(assignment.vehiculo_id._id || assignment.vehiculo_id);
                            
                            if (!vehicleIds.includes(vehicleId)) {
                                vehicleIds.push(vehicleId);
                                const vehicle = assignment.vehiculo_id;
                                if (vehicle && typeof vehicle === 'object') {
                                    vehicles.push(vehicle);
                                }
                            }
                        }
                    }
                }
            }

            // Obtener vehículos completos si no están populados
            const vehiclesToCheck = vehicles.length > 0 && vehicles[0].flota 
                ? vehicles 
                : await vehicleModel.find({ _id: { $in: vehicleIds } })
                    .populate('owner_id.company_id', '_id company_name')
                    .populate({
                        path: 'owner_id.user_id',
                        select: '_id full_name company_id',
                        populate: {
                            path: 'company_id',
                            select: '_id'
                        }
                    })
                    .select('placa flota owner_id')
                    .lean();

            // Validar que todos los vehículos sean afiliados o externos (NO propios)
            const vehiculosPropios = vehiclesToCheck.filter((v: any) => v.flota === 'propio');
            if (vehiculosPropios.length > 0) {
                const placasPropios = vehiculosPropios.map((v: any) => v.placa || v._id).join(", ");
                throw new ResponseError(400, `No se puede generar preliquidación para vehículos propios. Vehículos propios encontrados: ${placasPropios}`);
            }

            // Validar que todos los vehículos pertenezcan al mismo propietario
            const normalizeId = (id: any) => {
                if (!id) return null;
                if (typeof id === 'string') return id;
                return String(id._id || id);
            };

            const ownerCompanyIds: string[] = [];
            for (const vehicle of vehiclesToCheck) {
                const ownerId = vehicle.owner_id;
                if (!ownerId) {
                    throw new ResponseError(400, `El vehículo ${vehicle.placa || vehicle._id} no tiene propietario asignado`);
                }

                let ownerCompanyId: string | null = null;
                if (ownerId.type === 'Company' && ownerId.company_id) {
                    ownerCompanyId = normalizeId(ownerId.company_id);
                } else if (ownerId.type === 'User' && ownerId.user_id) {
                    const userId = ownerId.user_id as any;
                    if (userId && userId.company_id) {
                        ownerCompanyId = normalizeId(userId.company_id);
                    } else {
                        throw new ResponseError(400, `El vehículo ${vehicle.placa || vehicle._id} pertenece a un usuario sin compañía asociada`);
                    }
                }

                if (ownerCompanyId && !ownerCompanyIds.includes(ownerCompanyId)) {
                    ownerCompanyIds.push(ownerCompanyId);
                }
            }

            if (ownerCompanyIds.length === 0) {
                throw new ResponseError(400, "No se pudo determinar el propietario de los vehículos");
            }

            if (ownerCompanyIds.length > 1) {
                throw new ResponseError(400, "Todos los vehículos deben pertenecer al mismo propietario para generar una preliquidación");
            }

            // Validar que ninguna tenga preliquidación ya generada
            const solicitudesConPreliquidacion = solicitudes.filter(s => (s as any).preliquidacion_id);
            if (solicitudesConPreliquidacion.length > 0) {
                const hesConPreliquidacion = solicitudesConPreliquidacion.map(s => s.he).join(", ");
                throw new ResponseError(400, `Las siguientes solicitudes ya tienen preliquidación: ${hesConPreliquidacion}`);
            }

            // Obtener gastos operacionales
            const gastosOp = await vhc_operationalModel.find({
                _id: { $in: gastos_operacionales_ids || [] },
                estado: "no_liquidado"
            }).lean();

            // Validar que todos los gastos Op existan y estén no liquidados
            if (gastos_operacionales_ids && gastos_operacionales_ids.length > 0) {
                if (gastosOp.length !== gastos_operacionales_ids.length) {
                    const encontrados = gastosOp.map(g => g._id.toString());
                    const noEncontrados = gastos_operacionales_ids.filter(id => !encontrados.includes(id));
                    throw new ResponseError(404, `Los siguientes gastos operacionales no fueron encontrados o ya están liquidados: ${noEncontrados.join(", ")}`);
                }
            }

            // Obtener gastos preoperacionales
            const gastosPreOp = await vhc_preoperationalModel.find({
                _id: { $in: gastos_preoperacionales_ids || [] },
                estado: "no_liquidado"
            }).lean();

            // Validar que todos los gastos PreOp existan y estén no liquidados
            if (gastos_preoperacionales_ids && gastos_preoperacionales_ids.length > 0) {
                if (gastosPreOp.length !== gastos_preoperacionales_ids.length) {
                    const encontrados = gastosPreOp.map(g => g._id.toString());
                    const noEncontrados = gastos_preoperacionales_ids.filter(id => !encontrados.includes(id));
                    throw new ResponseError(404, `Los siguientes gastos preoperacionales no fueron encontrados o ya están liquidados: ${noEncontrados.join(", ")}`);
                }
            }

            // Calcular totales
            // Total de solicitudes: suma de valor_a_facturar
            const total_solicitudes = solicitudes.reduce((sum, s) => {
                return sum + ((s as any).valor_a_facturar || 0);
            }, 0);

            // Total gastos operacionales: suma de todos los bills
            const total_gastos_operacionales = gastosOp.reduce((sum, gasto) => {
                const billsTotal = (gasto.bills || []).reduce((bSum: number, bill: any) => bSum + (bill.value || 0), 0);
                return sum + billsTotal;
            }, 0);

            // Total gastos preoperacionales: suma de todos los reports.value
            const total_gastos_preoperacionales = gastosPreOp.reduce((sum, gasto) => {
                const reportsTotal = (gasto.reports || []).reduce((rSum: number, report: any) => rSum + (report.value || 0), 0);
                return sum + reportsTotal;
            }, 0);

            // Total preliquidación: solicitudes - gastos
            const total_preliquidacion = total_solicitudes - (total_gastos_operacionales + total_gastos_preoperacionales);

            // Generar número de preliquidación automáticamente
            const nombreClienteLimpio = this.cleanClientNameForPreliquidacion(cliente.name);
            const hesOrdenados = solicitudes.map(s => s.he).sort();
            const hePrimera = hesOrdenados[0];
            const heUltima = hesOrdenados[hesOrdenados.length - 1];
            const preliquidacion_numero = hesOrdenados.length === 1 
                ? `PRELIQ_${hePrimera}_${nombreClienteLimpio}`
                : `PRELIQ_MULTI_${hePrimera}-${heUltima}_${nombreClienteLimpio}`;

            // Crear preliquidación
            // company_id es la empresa donde está relacionada la información (la empresa que genera la preliquidación)
            const preliquidacion = await preliquidacionModel.create({
                company_id: company_id, // Empresa que genera la preliquidación
                numero: preliquidacion_numero,
                fecha: new Date(),
                solicitudes_ids: solicitudes_ids.map(id => id as any),
                gastos_operacionales_ids: (gastos_operacionales_ids || []).map(id => id as any),
                gastos_preoperacionales_ids: (gastos_preoperacionales_ids || []).map(id => id as any),
                total_solicitudes,
                total_gastos_operacionales,
                total_gastos_preoperacionales,
                total_preliquidacion,
                estado: "pendiente",
                enviada_al_cliente: false,
                historial_envios: [],
                created_by: user_id as any
            });

            // Actualizar solicitudes con referencia a preliquidación
            await solicitudModel.updateMany(
                { _id: { $in: solicitudes_ids } },
                { 
                    preliquidacion_id: preliquidacion._id,
                    accounting_status: "listo_para_liquidar",
                    last_modified_by: user_id as any
                }
            );

            // Populizar antes de retornar
            const preliquidacionPopulada = await preliquidacionModel.findById(preliquidacion._id)
                .populate('solicitudes_ids', 'he valor_a_facturar cliente')
                .populate('gastos_operacionales_ids')
                .populate('gastos_preoperacionales_ids')
                .populate('created_by', 'full_name')
                .lean();

            return {
                message: "Preliquidación generada exitosamente",
                preliquidacion: preliquidacionPopulada
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "Error al generar preliquidación");
        }
    }

    /**
     * Aprobar preliquidación (rol contabilidad)
     * Actualiza estados de gastos a "liquidado"
     */
    public async approve_preliquidacion({
        preliquidacion_id,
        user_id,
        notas
    }: {
        preliquidacion_id: string;
        user_id: string;
        notas?: string;
    }) {
        try {
            const preliquidacion = await preliquidacionModel.findById(preliquidacion_id);
            if (!preliquidacion) {
                throw new ResponseError(404, "Preliquidación no encontrada");
            }

            if (preliquidacion.estado !== "pendiente") {
                throw new ResponseError(400, `La preliquidación ya está ${preliquidacion.estado}`);
            }

            // Actualizar preliquidación
            preliquidacion.estado = "aprobada";
            preliquidacion.aprobada_por = user_id as any;
            preliquidacion.aprobada_fecha = new Date();
            preliquidacion.notas = notas;
            preliquidacion.last_modified_by = user_id as any;
            await preliquidacion.save();

            // Actualizar estados de gastos a "liquidado"
            if (preliquidacion.gastos_operacionales_ids.length > 0) {
                await vhc_operationalModel.updateMany(
                    { _id: { $in: preliquidacion.gastos_operacionales_ids } },
                    { estado: "liquidado" }
                );
            }

            if (preliquidacion.gastos_preoperacionales_ids.length > 0) {
                await vhc_preoperationalModel.updateMany(
                    { _id: { $in: preliquidacion.gastos_preoperacionales_ids } },
                    { estado: "liquidado" }
                );
            }

            // Populizar antes de retornar
            const preliquidacionPopulada = await preliquidacionModel.findById(preliquidacion._id)
                .populate('solicitudes_ids', 'he valor_a_facturar cliente')
                .populate('gastos_operacionales_ids')
                .populate('gastos_preoperacionales_ids')
                .populate('aprobada_por', 'full_name')
                .populate('created_by', 'full_name')
                .lean();

            return {
                message: "Preliquidación aprobada exitosamente",
                preliquidacion: preliquidacionPopulada
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "Error al aprobar preliquidación");
        }
    }

    /**
     * Rechazar preliquidación (rol contabilidad)
     * Los gastos vuelven a "no_liquidado"
     */
    public async reject_preliquidacion({
        preliquidacion_id,
        user_id,
        notas
    }: {
        preliquidacion_id: string;
        user_id: string;
        notas?: string;
    }) {
        try {
            const preliquidacion = await preliquidacionModel.findById(preliquidacion_id);
            if (!preliquidacion) {
                throw new ResponseError(404, "Preliquidación no encontrada");
            }

            if (preliquidacion.estado !== "pendiente") {
                throw new ResponseError(400, `La preliquidación ya está ${preliquidacion.estado}`);
            }

            // Actualizar preliquidación
            preliquidacion.estado = "rechazada";
            preliquidacion.rechazada_por = user_id as any;
            preliquidacion.rechazada_fecha = new Date();
            preliquidacion.notas = notas;
            preliquidacion.last_modified_by = user_id as any;
            await preliquidacion.save();

            // Actualizar estados de gastos a "no_liquidado"
            if (preliquidacion.gastos_operacionales_ids.length > 0) {
                await vhc_operationalModel.updateMany(
                    { _id: { $in: preliquidacion.gastos_operacionales_ids } },
                    { estado: "no_liquidado" }
                );
            }

            if (preliquidacion.gastos_preoperacionales_ids.length > 0) {
                await vhc_preoperationalModel.updateMany(
                    { _id: { $in: preliquidacion.gastos_preoperacionales_ids } },
                    { estado: "no_liquidado" }
                );
            }

            // Remover referencia de solicitudes
            await solicitudModel.updateMany(
                { _id: { $in: preliquidacion.solicitudes_ids } },
                { 
                    preliquidacion_id: undefined,
                    accounting_status: "facturado", // Volver al estado anterior
                    last_modified_by: user_id as any
                }
            );

            // Populizar antes de retornar
            const preliquidacionPopulada = await preliquidacionModel.findById(preliquidacion._id)
                .populate('solicitudes_ids', 'he valor_a_facturar cliente')
                .populate('gastos_operacionales_ids')
                .populate('gastos_preoperacionales_ids')
                .populate('rechazada_por', 'full_name')
                .populate('created_by', 'full_name')
                .lean();

            return {
                message: "Preliquidación rechazada exitosamente",
                preliquidacion: preliquidacionPopulada
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "Error al rechazar preliquidación");
        }
    }

    /**
     * Generar PDF de preliquidación
     */
    public async generate_preliquidacion_pdf({
        preliquidacion_id
    }: {
        preliquidacion_id: string;
    }): Promise<{ filename: string; buffer: Buffer }> {
        try {
            const preliquidacion = await preliquidacionModel.findById(preliquidacion_id)
                .populate({
                    path: 'solicitudes_ids',
                    populate: {
                        path: 'cliente',
                        select: 'name contacts phone email company_id',
                        populate: {
                            path: 'company_id',
                            select: 'company_name document logo'
                        }
                    }
                })
                .populate('gastos_operacionales_ids')
                .populate('gastos_preoperacionales_ids')
                .lean();

            if (!preliquidacion) {
                throw new ResponseError(404, "Preliquidación no encontrada");
            }

            // Obtener información del propietario del vehículo desde las solicitudes
            const solicitudes = (preliquidacion as any).solicitudes_ids || [];
            if (solicitudes.length === 0) {
                throw new ResponseError(400, "La preliquidación no tiene solicitudes asociadas");
            }

            // Obtener vehículos de las solicitudes para determinar el propietario
            const vehicleIds: string[] = [];
            for (const solicitud of solicitudes) {
                if ((solicitud as any).vehiculo_id) {
                    const vehicleId = typeof (solicitud as any).vehiculo_id === 'string' 
                        ? (solicitud as any).vehiculo_id 
                        : String((solicitud as any).vehiculo_id._id || (solicitud as any).vehiculo_id);
                    if (!vehicleIds.includes(vehicleId)) {
                        vehicleIds.push(vehicleId);
                    }
                }
                if ((solicitud as any).vehicle_assignments && Array.isArray((solicitud as any).vehicle_assignments)) {
                    for (const assignment of (solicitud as any).vehicle_assignments) {
                        if (assignment.vehiculo_id) {
                            const vehicleId = typeof assignment.vehiculo_id === 'string'
                                ? assignment.vehiculo_id
                                : String(assignment.vehiculo_id._id || assignment.vehiculo_id);
                            if (!vehicleIds.includes(vehicleId)) {
                                vehicleIds.push(vehicleId);
                            }
                        }
                    }
                }
            }

            // Obtener vehículos con información del propietario
            const vehicles = await vehicleModel.find({ _id: { $in: vehicleIds } })
                .populate('owner_id.company_id', '_id company_name')
                .populate({
                    path: 'owner_id.user_id',
                    select: '_id full_name company_id',
                    populate: {
                        path: 'company_id',
                        select: '_id company_name'
                    }
                })
                .select('placa flota owner_id')
                .lean();

            if (vehicles.length === 0) {
                throw new ResponseError(400, "No se encontraron vehículos en las solicitudes");
            }

            // Obtener el propietario del vehículo (debe ser el mismo para todos)
            const normalizeId = (id: any) => {
                if (!id) return null;
                if (typeof id === 'string') return id;
                return String(id._id || id);
            };

            const firstVehicle = vehicles[0];
            const ownerId = firstVehicle.owner_id;
            if (!ownerId) {
                throw new ResponseError(400, "Los vehículos no tienen propietario asignado");
            }

            let propietarioCompanyId: string | null = null;
            if (ownerId.type === 'Company' && ownerId.company_id) {
                propietarioCompanyId = normalizeId(ownerId.company_id);
            } else if (ownerId.type === 'User' && ownerId.user_id) {
                const userId = ownerId.user_id as any;
                if (userId && userId.company_id) {
                    propietarioCompanyId = normalizeId(userId.company_id);
                } else {
                    throw new ResponseError(400, "El propietario del vehículo es un usuario sin compañía asociada");
                }
            }

            if (!propietarioCompanyId) {
                throw new ResponseError(400, "No se pudo determinar el propietario del vehículo");
            }

            // Obtener información de la compañía propietaria
            const { CompanyService } = await import("@/services/company.service");
            const companyService = new CompanyService();
            const company = await companyService.get_company_by({ company_id: propietarioCompanyId });

            if (!company) {
                throw new ResponseError(400, "No se pudo obtener la información del propietario del vehículo");
            }

            // Leer template HTML
            const templatePath = path.join(__dirname, "../email/templates/preliquidacion.html");
            let html_template: string;
            try {
                html_template = fs.readFileSync(templatePath, "utf8");
            } catch (error) {
                throw new ResponseError(500, "No se pudo cargar el template de preliquidación");
            }

            // Preparar datos para el template
            // Las solicitudes ya están obtenidas arriba
            const fechaExpedicion = dayjs(new Date()).format("DD/MM/YYYY");
            const preliquidacionNumero = preliquidacion.numero;
            const nit = company?.document?.number 
                ? `${company.document.number}${company.document.dv ? "-" + company.document.dv : ""}`
                : "N/A";

            // Tabla de solicitudes
            let solicitudesTable = "";
            solicitudes.forEach((solicitud: any) => {
                const fechaInicio = dayjs(solicitud.fecha).format("DD/MM/YYYY");
                const valorFacturar = new Intl.NumberFormat("es-CO", {
                    style: "currency",
                    currency: "COP",
                    minimumFractionDigits: 0
                }).format(solicitud.valor_a_facturar || 0);

                solicitudesTable += `
                    <tr>
                        <td>${solicitud.he || "N/A"}</td>
                        <td>${fechaInicio}</td>
                        <td>${solicitud.origen || "N/A"}</td>
                        <td>${solicitud.destino || "N/A"}</td>
                        <td class="text-right">${valorFacturar}</td>
                    </tr>
                `;
            });

            // Tabla de gastos operacionales
            let gastosOpTable = "";
            const gastosOp = (preliquidacion as any).gastos_operacionales_ids || [];
            gastosOp.forEach((gasto: any) => {
                const billsTotal = (gasto.bills || []).reduce((sum: number, bill: any) => sum + (bill.value || 0), 0);
                const valorFormateado = new Intl.NumberFormat("es-CO", {
                    style: "currency",
                    currency: "COP",
                    minimumFractionDigits: 0
                }).format(billsTotal);

                gastosOpTable += `
                    <tr>
                        <td>${gasto._id}</td>
                        <td class="text-right">${valorFormateado}</td>
                    </tr>
                `;
            });

            // Tabla de gastos preoperacionales
            let gastosPreOpTable = "";
            const gastosPreOp = (preliquidacion as any).gastos_preoperacionales_ids || [];
            gastosPreOp.forEach((gasto: any) => {
                const reportsTotal = (gasto.reports || []).reduce((sum: number, report: any) => sum + (report.value || 0), 0);
                const valorFormateado = new Intl.NumberFormat("es-CO", {
                    style: "currency",
                    currency: "COP",
                    minimumFractionDigits: 0
                }).format(reportsTotal);

                gastosPreOpTable += `
                    <tr>
                        <td>${gasto._id}</td>
                        <td class="text-right">${valorFormateado}</td>
                    </tr>
                `;
            });

            // Totales formateados
            const totalSolicitudesFormateado = new Intl.NumberFormat("es-CO", {
                style: "currency",
                currency: "COP",
                minimumFractionDigits: 0
            }).format(preliquidacion.total_solicitudes);

            const totalGastosOpFormateado = new Intl.NumberFormat("es-CO", {
                style: "currency",
                currency: "COP",
                minimumFractionDigits: 0
            }).format(preliquidacion.total_gastos_operacionales);

            const totalGastosPreOpFormateado = new Intl.NumberFormat("es-CO", {
                style: "currency",
                currency: "COP",
                minimumFractionDigits: 0
            }).format(preliquidacion.total_gastos_preoperacionales);

            const totalPreliquidacionFormateado = new Intl.NumberFormat("es-CO", {
                style: "currency",
                currency: "COP",
                minimumFractionDigits: 0
            }).format(preliquidacion.total_preliquidacion);

            // Reemplazar variables en el template
            const html_final = this.replaceVariables(html_template, {
                preliquidacion_numero: preliquidacionNumero,
                company_name: company.company_name || "N/A",
                company_nit: nit,
                propietario_name: company.company_name || "N/A", // Propietario del vehículo
                contacto: solicitudes.length > 0 ? (solicitudes[0] as any).contacto || "N/A" : "N/A",
                contacto_phone: solicitudes.length > 0 ? (solicitudes[0] as any).contacto_phone || "N/A" : "N/A",
                propietario_email: "", // Se obtendrá del usuario de contacto de la compañía
                fecha_expedicion: fechaExpedicion,
                solicitudes_table: solicitudesTable || "<tr><td colspan='5'>No hay solicitudes</td></tr>",
                gastos_op_table: gastosOpTable || "<tr><td colspan='2'>No hay gastos operacionales</td></tr>",
                gastos_preop_table: gastosPreOpTable || "<tr><td colspan='2'>No hay gastos preoperacionales</td></tr>",
                total_solicitudes: totalSolicitudesFormateado,
                total_gastos_operacionales: totalGastosOpFormateado,
                total_gastos_preoperacionales: totalGastosPreOpFormateado,
                total_preliquidacion: totalPreliquidacionFormateado,
                year: new Date().getFullYear().toString()
            });

            // Generar PDF
            const pdfBuffer = await renderHtmlToPdfBuffer(html_final);
            const filename = `preliquidacion_${preliquidacionNumero}_${dayjs().format("YYYY-MM-DD")}.pdf`;

            return { filename, buffer: pdfBuffer };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "Error al generar PDF de preliquidación");
        }
    }

    /**
     * Enviar preliquidación al cliente (solo si está aprobada)
     */
    public async send_preliquidacion_to_client({
        preliquidacion_id,
        user_id,
        notas
    }: {
        preliquidacion_id: string;
        user_id: string;
        notas?: string;
    }) {
        try {
            const preliquidacion = await preliquidacionModel.findById(preliquidacion_id).lean();

            if (!preliquidacion) {
                throw new ResponseError(404, "Preliquidación no encontrada");
            }

            if (preliquidacion.estado !== "aprobada") {
                throw new ResponseError(400, "Solo se pueden enviar preliquidaciones aprobadas al propietario del vehículo");
            }

            // Obtener información del propietario del vehículo desde las solicitudes
            const preliquidacionConSolicitudes = await preliquidacionModel.findById(preliquidacion_id)
                .populate({
                    path: 'solicitudes_ids',
                    populate: [
                        {
                            path: 'vehiculo_id',
                            select: 'owner_id',
                            populate: [
                                {
                                    path: 'owner_id.company_id',
                                    select: '_id company_name'
                                },
                                {
                                    path: 'owner_id.user_id',
                                    select: '_id full_name company_id',
                                    populate: {
                                        path: 'company_id',
                                        select: '_id company_name'
                                    }
                                }
                            ]
                        },
                        {
                            path: 'vehicle_assignments.vehiculo_id',
                            select: 'owner_id',
                            populate: [
                                {
                                    path: 'owner_id.company_id',
                                    select: '_id company_name'
                                },
                                {
                                    path: 'owner_id.user_id',
                                    select: '_id full_name company_id',
                                    populate: {
                                        path: 'company_id',
                                        select: '_id company_name'
                                    }
                                }
                            ]
                        }
                    ]
                })
                .lean();

            if (!preliquidacionConSolicitudes) {
                throw new ResponseError(404, "Preliquidación no encontrada");
            }

            const solicitudes = (preliquidacionConSolicitudes as any).solicitudes_ids || [];
            if (solicitudes.length === 0) {
                throw new ResponseError(400, "La preliquidación no tiene solicitudes asociadas");
            }

            // Obtener vehículos y determinar el propietario
            const vehicleIds: string[] = [];
            const vehicles: any[] = [];

            for (const solicitud of solicitudes) {
                if ((solicitud as any).vehiculo_id) {
                    const vehicleId = typeof (solicitud as any).vehiculo_id === 'string' 
                        ? (solicitud as any).vehiculo_id 
                        : String((solicitud as any).vehiculo_id._id || (solicitud as any).vehiculo_id);
                    if (!vehicleIds.includes(vehicleId)) {
                        vehicleIds.push(vehicleId);
                        vehicles.push((solicitud as any).vehiculo_id);
                    }
                }
                if ((solicitud as any).vehicle_assignments && Array.isArray((solicitud as any).vehicle_assignments)) {
                    for (const assignment of (solicitud as any).vehicle_assignments) {
                        if (assignment.vehiculo_id) {
                            const vehicleId = typeof assignment.vehiculo_id === 'string'
                                ? assignment.vehiculo_id
                                : String(assignment.vehiculo_id._id || assignment.vehiculo_id);
                            if (!vehicleIds.includes(vehicleId)) {
                                vehicleIds.push(vehicleId);
                                vehicles.push(assignment.vehiculo_id);
                            }
                        }
                    }
                }
            }

            if (vehicles.length === 0) {
                throw new ResponseError(400, "No se encontraron vehículos en las solicitudes");
            }

            // Obtener el propietario del vehículo (debe ser el mismo para todos)
            const normalizeId = (id: any) => {
                if (!id) return null;
                if (typeof id === 'string') return id;
                return String(id._id || id);
            };

            const firstVehicle = vehicles[0];
            const ownerId = firstVehicle.owner_id;
            if (!ownerId) {
                throw new ResponseError(400, "Los vehículos no tienen propietario asignado");
            }

            let propietarioCompanyId: string | null = null;
            if (ownerId.type === 'Company' && ownerId.company_id) {
                propietarioCompanyId = normalizeId(ownerId.company_id);
            } else if (ownerId.type === 'User' && ownerId.user_id) {
                const userId = ownerId.user_id as any;
                if (userId && userId.company_id) {
                    propietarioCompanyId = normalizeId(userId.company_id);
                } else {
                    throw new ResponseError(400, "El propietario del vehículo es un usuario sin compañía asociada");
                }
            }

            if (!propietarioCompanyId) {
                throw new ResponseError(400, "No se pudo determinar el propietario del vehículo");
            }

            // Obtener información de la compañía propietaria
            const { CompanyService } = await import("@/services/company.service");
            const companyService = new CompanyService();
            const company = await companyService.get_company_by({ company_id: propietarioCompanyId });

            if (!company) {
                throw new ResponseError(400, "No se pudo obtener la información del propietario del vehículo");
            }

            // Buscar usuario de contacto de la compañía propietaria (admin, coordinador, contabilidad)
            const companyContact = await userModel.findOne({
                company_id: propietarioCompanyId,
                role: { $in: ['admin', 'coordinador', 'contabilidad', 'comercia', 'superadmon'] },
                is_active: true,
                is_delete: false
            }).select('email full_name').lean();

            if (!companyContact || !companyContact.email) {
                throw new ResponseError(400, "El propietario del vehículo no tiene información de contacto configurada");
            }

            // Generar PDF
            const { filename, buffer } = await this.generate_preliquidacion_pdf({
                preliquidacion_id
            });

            // Enviar email al propietario del vehículo (importar función de email)
            const { send_client_preliquidacion } = await import("@/email/index.email");
            await send_client_preliquidacion({
                client_name: companyContact.full_name || company.company_name,
                client_email: companyContact.email,
                company_name: company.company_name || "Admin Transporte",
                preliquidacion_numero: preliquidacion.numero,
                preliquidacion_pdf: { filename, buffer },
                notas,
                dashboard_link: process.env.FRONTEND_URL || ""
            });

            // Actualizar preliquidación
            await preliquidacionModel.findByIdAndUpdate(preliquidacion_id, {
                enviada_al_cliente: true,
                fecha_envio_cliente: new Date(),
                enviada_por: user_id as any,
                $push: {
                    historial_envios: {
                        fecha: new Date(),
                        estado: "aprobada",
                        enviado_por: user_id as any,
                        notas: notas || ""
                    }
                },
                last_modified_by: user_id as any
            });

            return {
                message: "Preliquidación enviada al cliente exitosamente"
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "Error al enviar preliquidación al cliente");
        }
    }

    /**
     * Obtener gastos pendientes (no liquidados) de los vehículos asociados a las solicitudes
     */
    public async get_pending_expenses({ solicitudes_ids }: { solicitudes_ids: string[] }) {
        try {
            if (!solicitudes_ids || solicitudes_ids.length === 0) {
                return {
                    gastos_operacionales: [],
                    gastos_preoperacionales: []
                };
            }

            // Obtener solicitudes para extraer vehículos
            const solicitudes = await solicitudModel.find({
                _id: { $in: solicitudes_ids }
            })
            .select('vehiculo_id vehicle_assignments')
            .lean();

            // Extraer IDs únicos de vehículos
            const vehicleIds = new Set<string>();
            
            for (const solicitud of solicitudes) {
                // Vehículo principal
                if ((solicitud as any).vehiculo_id) {
                    const vId = (solicitud as any).vehiculo_id.toString();
                    if (vId) vehicleIds.add(vId);
                }
                
                // Vehículos asignados
                if ((solicitud as any).vehicle_assignments && Array.isArray((solicitud as any).vehicle_assignments)) {
                    for (const assignment of (solicitud as any).vehicle_assignments) {
                        if (assignment.vehiculo_id) {
                            const vId = assignment.vehiculo_id.toString();
                            if (vId) vehicleIds.add(vId);
                        }
                    }
                }
            }

            const uniqueVehicleIds = Array.from(vehicleIds);

            if (uniqueVehicleIds.length === 0) {
                return {
                    gastos_operacionales: [],
                    gastos_preoperacionales: []
                };
            }

            // Buscar gastos operacionales no liquidados
            const gastosOperacionales = await vhc_operationalModel.find({
                vehicle_id: { $in: uniqueVehicleIds },
                estado: "no_liquidado"
            })
            .populate('vehicle_id', 'placa')
            .lean();

            // Buscar gastos preoperacionales no liquidados
            const gastosPreoperacionales = await vhc_preoperationalModel.find({
                vehicle_id: { $in: uniqueVehicleIds },
                estado: "no_liquidado"
            })
            .populate('vehicle_id', 'placa')
            .lean();

            return {
                gastos_operacionales: gastosOperacionales,
                gastos_preoperacionales: gastosPreoperacionales
            };

        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "Error al obtener gastos pendientes");
        }
    }

    /**
     * Reemplazar variables en un template HTML
     */
    private replaceVariables(html: string, variables: Record<string, string>): string {
        let result = html;
        Object.keys(variables).forEach((key) => {
            const value = variables[key] || "";
            const placeholder = `{{${key}}}`;
            if (result.includes(placeholder)) {
                // Usar replace simple en lugar de regex para strings muy grandes
                // El regex puede fallar con strings muy grandes (como imágenes base64)
                const placeholderRegex = new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "g");
                const beforeLength = result.length;
                result = result.replace(placeholderRegex, value);
                const afterLength = result.length;
                
                // Log para variables grandes (imágenes)
                if (value.length > 10000) {
                    console.log(`[replaceVariables] Reemplazado ${placeholder}: ${beforeLength} -> ${afterLength} caracteres (valor: ${value.length} chars)`);
                    // Verificar que el reemplazo funcionó
                    if (result.includes(placeholder)) {
                        console.error(`[replaceVariables] ERROR: El placeholder ${placeholder} aún existe después del reemplazo!`);
                        // Fallback: reemplazo directo
                        result = result.split(placeholder).join(value);
                    }
                }
            } else {
                console.warn(`[replaceVariables] Placeholder ${placeholder} no encontrado en el template`);
            }
        });
        return result;
    }
}
