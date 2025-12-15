import { Vehicle, VehicleTypes } from '@/contracts/interfaces/vehicles.interface';
import vehicleModel from '@/models/vehicle.model';
import { ResponseError } from '@/utils/errors';
import { UserService } from './users.service';
import { CompanyService } from './company.service';
import { UploadApiResponse } from 'cloudinary';
import { upload_media } from '@/utils/cloudinary';
import { DEFAULT_PROFILE } from '@/utils/constants';
import vhc_documentsModel from '@/models/vhc_documents.model';
import vhc_preoperationalModel from '@/models/vhc_preoperational.model';
import vhc_operationalModel from '@/models/vhc_operational.model';
import { send_vehicle_created_assigned, send_preoperational_report, send_operational_bills } from '@/email/index.email';
import companyModel from '@/models/company.model';
import userModel from '@/models/user.model';
import { delete_media } from '@/utils/cloudinary';
import fs from "fs";
import path from "path";
import dayjs from "dayjs";
import { renderHtmlToPdfBuffer } from "@/utils/pdf";
export class VehicleServices {

    private static UserService = new UserService()
    private static CompanyService = new CompanyService()

    //* #========== POST METHODS ==========#
    public async create_new_vehicle({ payload, company_id, picture }: { payload: Vehicle, company_id: string, picture: Express.Multer.File }) {
        try {
            const {
                driver_id,
                possible_drivers,
                n_numero_interno,
                placa,
                name,
                description,
                seats,
                type,
                flota,
                owner_id,
                technical_sheet
            } = payload;

            // Validaciones que se pueden ejecutar en paralelo
            const validationPromises = [
                this.verify_exist_vehicle({ placa, company_id }),
                VehicleServices.UserService.verify_exist_user_by_id({ id: String(driver_id) })
            ];

            // Agregar validaciones según el tipo de propietario
            if (owner_id.type === "Company") {
                validationPromises.push(
                    VehicleServices.CompanyService.verify_exist_company_by_id(String(owner_id.company_id))
                );
            } else {
                validationPromises.push(
                    VehicleServices.UserService.verify_exist_user_by_id({ id: String(owner_id.user_id) })
                );
            }

            // Ejecutar todas las validaciones en paralelo
            await Promise.all(validationPromises);

            // Subir imagen si existe
            let uploaded_file: UploadApiResponse | null = null;
            if (picture) {
                uploaded_file = await upload_media({ file: picture });
            }

            // Crear el vehículo
            const new_vehicle = await vehicleModel.create({
                driver_id,
                possible_drivers: possible_drivers || [],
                n_numero_interno,
                placa,
                name,
                description,
                seats,
                type,
                picture: uploaded_file ? {
                    url: uploaded_file.secure_url,
                    public_id: uploaded_file.public_id,
                    type: "img"
                } : DEFAULT_PROFILE,
                flota,
                technical_sheet: technical_sheet || {},
                owner_id,
                created: new Date()
            });

            await new_vehicle.save();

            const vehicle_documents = await vhc_documentsModel.create({
                vehicle_id: new_vehicle._id,
                soat: null,
                tecnomecanica: null,
                seguro: null,
                licencia_transito: null,
                runt: null
            })
            await vehicle_documents.save()

            // Notificar a los involucrados (empresa, usuario o ambos) sobre la creacion y asignacion del vehiculo via email
            try {
                // Obtener información del conductor
                const driver = await VehicleServices.UserService.get_user_by_id({ id: String(driver_id) });
                
                // Obtener información según el tipo de propietario
                if (owner_id.type === "Company") {
                    const company = await VehicleServices.CompanyService.get_company_by({ company_id: String(owner_id.company_id) });
                    // Buscar email de contacto de la empresa (admin o coordinador)
                    const companyContact = await userModel.findOne({
                        company_id: owner_id.company_id,
                        role: { $in: ['admin', 'coordinador', 'comercia', 'superadmon'] },
                        is_active: true,
                        is_delete: false
                    }).select('email').lean();
                    
                    if (companyContact) {
                        await send_vehicle_created_assigned({
                            owner_name: company.company_name,
                            owner_email: companyContact.email,
                            placa,
                            vehicle_name: name ?? placa,
                            type,
                            flota,
                            driver_name: driver.full_name
                        });
                    }
                } else if (owner_id.type === "User") {
                    const owner = await VehicleServices.UserService.get_user_by_id({ id: String(owner_id.user_id) });
                    await send_vehicle_created_assigned({
                        owner_name: owner.full_name,
                        owner_email: owner.email,
                        placa,
                        vehicle_name: name ?? placa,
                        type,
                        flota,
                        driver_name: driver.full_name
                    });
                }
            } catch (emailError) {
                console.log("Error al enviar email de vehículo creado:", emailError);
            }

        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo crear el vehiculo")
        }
    }

    public async create_preoperational_report({
        vehicle_id,
        driver_id,
        reports
    }: {
        vehicle_id: string,
        driver_id: string,
        reports: Array<{
            media: Express.Multer.File[],
            description: string,
            status: "ok" | "details" | "failures"
        }>
    }) {
        try {
            // Validar que el vehículo y el conductor existan
            await Promise.all([
                vehicleModel.findById(vehicle_id).then(vehicle => {
                    if (!vehicle) throw new ResponseError(404, "No se encontró el vehículo");
                }),
                VehicleServices.UserService.verify_exist_user_by_id({ id: driver_id })
            ]);

            // Procesar cada reporte y subir sus archivos multimedia (si existen)
            const processedReports = await Promise.all(
                reports.map(async (report) => {
                    // Solo subir archivos si se proporcionaron
                    let uploadedMedia: Array<{
                        url: string;
                        public_id: string;
                        type: string;
                        original_name: string;
                    }> = [];
                    if (report.media && report.media.length > 0) {
                        uploadedMedia = await Promise.all(
                            report.media.map(async (file) => {
                                const uploaded = await upload_media({ file });
                                return {
                                    url: uploaded.secure_url,
                                    public_id: uploaded.public_id,
                                    type: file.mimetype.startsWith('video/') ? 'video' : 'img',
                                    original_name: file.originalname
                                };
                            })
                        );
                    }

                    return {
                        media: uploadedMedia,
                        description: report.description,
                        status: report.status,
                        uploaded: new Date()
                    };
                })
            );

            // Crear el documento de reporte preoperacional
            const preoperational = await vhc_preoperationalModel.create({
                vehicle_id,
                uploaded_by: driver_id,
                reports: processedReports,
                created: new Date()
            });

            await preoperational.save();

            // Notificar a la empresa sobre el nuevo reporte preoperacional
            try {
                const vehicle = await vehicleModel.findById(vehicle_id)
                    .populate('owner_id.company_id', 'company_name')
                    .lean();
                
                if (!vehicle) throw new Error("Vehículo no encontrado");
                
                const driver = await VehicleServices.UserService.get_user_by_id({ id: driver_id });
                
                // Determinar estado del reporte
                const hasFailures = processedReports.some(r => r.status === "failures");
                const hasDetails = processedReports.some(r => r.status === "details");
                
                let report_status = "ok";
                let status_class = "ok";
                let report_status_text = "Todo en orden";
                let alert_message = "";
                
                if (hasFailures) {
                    report_status = "failures";
                    status_class = "failures";
                    report_status_text = "Fallas detectadas";
                    alert_message = "Este reporte contiene fallas que requieren revisión inmediata. Por favor, ingresa al sistema para revisar los detalles completos.";
                } else if (hasDetails) {
                    report_status = "details";
                    status_class = "details";
                    report_status_text = "Detalles a revisar";
                    alert_message = "Este reporte contiene detalles que requieren revisión. Por favor, ingresa al sistema para revisar los detalles completos.";
                }
                
                // Obtener email de la empresa
                let company_email = "";
                let company_name = "";
                
                if (vehicle.owner_id && (vehicle.owner_id as any).type === "Company") {
                    const company_id = (vehicle.owner_id as any).company_id;
                    const company = await companyModel.findById(company_id).lean();
                    if (company) {
                        company_name = company.company_name;
                        const companyContact = await userModel.findOne({
                            company_id: company_id,
                            role: { $in: ['admin', 'coordinador', 'comercia', 'superadmon'] },
                            is_active: true,
                            is_delete: false
                        }).select('email').lean();
                        if (companyContact) {
                            company_email = companyContact.email;
                        }
                    }
                }
                
                if (company_email) {
                    await send_preoperational_report({
                        company_name,
                        company_email,
                        placa: vehicle.placa,
                        driver_name: driver.full_name,
                        report_status,
                        status_class,
                        report_status_text,
                        alert_message
                    });
                }
            } catch (emailError) {
                console.log("Error al enviar email de reporte preoperacional:", emailError);
            }

        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo crear el reporte preoperacional");
        }
    }

    public async create_operational_bills({
        vehicle_id,
        user_id,
        solicitud_id,
        bills
    }: {
        vehicle_id: string,
        user_id: string,
        solicitud_id?: string, // Opcional: vincular gastos a una solicitud específica
        bills: Array<{
            type_bill: "fuel" | "tolls" | "repairs" | "fines" | "parking_lot",
            value: number,
            description: string,
            media_support: Express.Multer.File[]
        }>
    }) {
        try {
            // Validar que el vehículo y el usuario existan
            await Promise.all([
                vehicleModel.findById(vehicle_id).then(vehicle => {
                    if (!vehicle) throw new ResponseError(404, "No se encontró el vehículo");
                }),
                VehicleServices.UserService.verify_exist_user_by_id({ id: user_id })
            ]);

            // Procesar cada factura/gasto y subir sus archivos de soporte (si existen)
            const processedBills = await Promise.all(
                bills.map(async (bill) => {
                    // Solo subir archivos si se proporcionaron
                    let uploadedMedia: Array<{
                        url: string;
                        public_id: string;
                        type: string;
                        original_name: string;
                        file_extension?: string;
                    }> = [];
                    if (bill.media_support && bill.media_support.length > 0) {
                        uploadedMedia = await Promise.all(
                            bill.media_support.map(async (file) => {
                                const uploaded = await upload_media({ file });
                                return {
                                    url: uploaded.secure_url,
                                    public_id: uploaded.public_id,
                                    type: file.mimetype.startsWith('video/') ? 'video' :
                                        file.mimetype.startsWith('image/') ? 'img' : 'file',
                                    original_name: file.originalname,
                                    file_extension: file.originalname.split('.').pop()
                                };
                            })
                        );
                    }

                    return {
                        type_bill: bill.type_bill,
                        value: bill.value,
                        description: bill.description,
                        media_support: uploadedMedia,
                        uploaded: new Date()
                    };
                })
            );

            // Validar solicitud_id si se proporciona
            if (solicitud_id) {
                const solicitudModel = (await import("@/models/solicitud.model")).default;
                const solicitud = await solicitudModel.findById(solicitud_id);
                if (!solicitud) throw new ResponseError(404, "Solicitud no encontrada");
            }

            // Crear el documento de gastos operacionales
            const operational = await vhc_operationalModel.create({
                vehicle_id,
                solicitud_id: solicitud_id || undefined,
                uploaded_by: user_id,
                bills: processedBills,
                created: new Date()
            });

            await operational.save();

            // Si hay solicitud_id, recalcular liquidación automáticamente
            if (solicitud_id) {
                try {
                    const { SolicitudesService } = await import("@/services/solicitudes.service");
                    const solicitudesService = new SolicitudesService();
                    await solicitudesService.calcular_liquidacion({ solicitud_id });
                } catch (calcError) {
                    console.log("Error al recalcular liquidación:", calcError);
                    // No lanzar error, solo loguear (el gasto ya se guardó)
                }
            }

            // Notificar a la empresa/contabilidad sobre los nuevos gastos registrados
            try {
                const vehicle = await vehicleModel.findById(vehicle_id)
                    .populate('owner_id.company_id', 'company_name')
                    .lean();
                
                if (!vehicle) throw new Error("Vehículo no encontrado");
                
                // Calcular total y tipos de gastos
                const total_value = processedBills.reduce((sum, bill) => sum + bill.value, 0);
                const bills_types = [...new Set(processedBills.map(b => b.type_bill))].join(", ");
                const hasSpecialBills = processedBills.some(b => b.type_bill === "repairs" || b.type_bill === "fines");
                
                const special_alert = hasSpecialBills 
                    ? 'Se han registrado gastos de tipo "repairs" o "fines" que requieren atención especial. Por favor, revisa los detalles en el sistema.'
                    : undefined;
                
                // Obtener email de la empresa/contabilidad
                let company_email = "";
                let company_name = "";
                
                if (vehicle.owner_id && ((vehicle.owner_id as any).type === "Company")) {
                    const company_id = (vehicle.owner_id as any).company_id;
                    const company = await companyModel.findById(company_id).lean();
                    if (company) {
                        company_name = company.company_name;
                        // Buscar contabilidad o admin/coordinador
                        const companyContact = await userModel.findOne({
                            company_id: company_id,
                            role: { $in: ['contabilidad', 'admin', 'coordinador', 'comercia', 'superadmon'] },
                            is_active: true,
                            is_delete: false
                        }).select('email').lean();
                        if (companyContact) {
                            company_email = companyContact.email;
                        }
                    }
                }
                
                if (company_email) {
                    await send_operational_bills({
                        company_name,
                        company_email,
                        placa: vehicle.placa,
                        bills_count: processedBills.length,
                        bills_types,
                        total_value,
                        special_alert
                    });
                }
            } catch (emailError) {
                console.log("Error al enviar email de gastos operacionales:", emailError);
            }

        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo crear el registro de gastos operacionales");
        }
    }



    //* #========== GET METHODS ==========#
    public async get_all_vehicles({ filters, page = 1, limit = 10 }: {
        filters: {
            placa?: string,
            type?: VehicleTypes,
            name?: string;
        },
        page?: number,
        limit?: number
    }) {
        try {
            // Construir el objeto de consulta dinámicamente
            const query: any = {};

            // Filtro por placa (búsqueda parcial, case-insensitive)
            if (filters.placa) {
                query.placa = { $regex: filters.placa, $options: 'i' };
            }

            // Filtro por tipo de vehículo
            if (filters.type) {
                query.type = filters.type;
            }

            // Filtro por nombre (búsqueda parcial, case-insensitive)
            if (filters.name) {
                query.name = { $regex: filters.name, $options: 'i' };
            }

            // Calcular skip para paginación
            const skip = (page - 1) * limit;

            // Ejecutar consulta con paginación y populate
            const [vehicles, total] = await Promise.all([
                vehicleModel
                    .find(query)
                    .populate({
                        path: 'driver_id',
                        select: 'full_name contact email role company_id',
                        match: { is_delete: false, is_active: true }
                    })
                    .populate({
                        path: 'possible_drivers',
                        select: 'full_name contact email role company_id',
                        match: { is_delete: false, is_active: true }
                    })
                    .populate('owner_id.company_id', 'company_name')
                    .populate('owner_id.user_id', 'full_name')
                    .skip(skip)
                    .limit(limit)
                    .sort({ created: -1 }) // Ordenar por fecha de creación (más recientes primero)
                    .lean(),
                vehicleModel.countDocuments(query) // Contar total de documentos que coinciden
            ]);

            return {
                vehicles,
                pagination: {
                    current_page: page,
                    total_pages: Math.ceil(total / limit),
                    total_vehicles: total,
                    limit,
                    has_next_page: page < Math.ceil(total / limit),
                    has_prev_page: page > 1
                }
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudieron listar los vehiculos")
        }
    }

    public async get_all_vehicles_by_company({ filters, page = 1, limit = 10, company_id }: {
        filters: {
            placa?: string,
            type?: VehicleTypes,
            name?: string;
        },
        page?: number,
        limit?: number,
        company_id: string
    }) {
        try {
            // Construir el objeto de consulta dinámicamente
            const query: any = {};

            query.owner_id.company_id = company_id;

            // Filtro por placa (búsqueda parcial, case-insensitive)
            if (filters.placa) {
                query.placa = { $regex: filters.placa, $options: 'i' };
            }

            // Filtro por tipo de vehículo
            if (filters.type) {
                query.type = filters.type;
            }

            // Filtro por nombre (búsqueda parcial, case-insensitive)
            if (filters.name) {
                query.name = { $regex: filters.name, $options: 'i' };
            }

            // Calcular skip para paginación
            const skip = (page - 1) * limit;

            // Ejecutar consulta con paginación y populate
            const [vehicles, total] = await Promise.all([
                vehicleModel
                    .find(query)
                    .populate({
                        path: 'driver_id',
                        select: 'full_name contact email role company_id',
                        match: { is_delete: false, is_active: true }
                    })
                    .populate({
                        path: 'possible_drivers',
                        select: 'full_name contact email role company_id',
                        match: { is_delete: false, is_active: true }
                    })
                    .populate('owner_id.company_id', 'company_name')
                    .populate('owner_id.user_id', 'full_name')
                    .skip(skip)
                    .limit(limit)
                    .sort({ created: -1 }) // Ordenar por fecha de creación (más recientes primero)
                    .lean(),
                vehicleModel.countDocuments(query) // Contar total de documentos que coinciden
            ]);

            return {
                vehicles,
                pagination: {
                    current_page: page,
                    total_pages: Math.ceil(total / limit),
                    total_vehicles: total,
                    limit,
                    has_next_page: page < Math.ceil(total / limit),
                    has_prev_page: page > 1
                }
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudieron listar los vehiculos")
        }
    }

    public async get_vehicles_by_user({ user_id }: { user_id: string }) {
        try {
            const vehicles = await vehicleModel.find({ owner_id: user_id }).lean();
            if (vehicles.length === 0) throw new ResponseError(404, "No se encontraron vehiculos")
            return vehicles;
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudieron listar los vehiculos")
        }
    }

    public async get_vehicle_by_id({ id }: { id: string }) {
        try {
            const vehicle = await vehicleModel
                .findById(id)
                .populate({
                    path: 'driver_id',
                    select: 'full_name contact email role company_id',
                    match: { is_delete: false, is_active: true }
                })
                .populate({
                    path: 'possible_drivers',
                    select: 'full_name contact email role company_id',
                    match: { is_delete: false, is_active: true }
                })
                .populate('owner_id.company_id', 'company_name')
                .populate('owner_id.user_id', 'full_name')
                .lean();

            if (!vehicle) throw new ResponseError(404, "No se encontró el vehículo");

            return vehicle;
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo obtener el vehículo");
        }
    }

    /**
     * Buscar vehículo por placa con toda la información del conductor y propietario
     * Útil para asignar vehículos a solicitudes ingresando solo la placa
     */
    public async get_vehicle_by_placa({ placa, company_id }: { placa: string, company_id?: string }) {
        try {
            // Buscar vehículo por placa
            const query: any = { placa: placa.toUpperCase().trim() };
            
            // Si se proporciona company_id, filtrar por vehículos de esa compañía
            if (company_id) {
                query['owner_id.company_id'] = company_id;
            }

            const vehicle = await vehicleModel
                .findOne(query)
                .populate({
                    path: 'driver_id',
                    select: 'full_name document contact email avatar role'
                })
                .populate({
                    path: 'possible_drivers',
                    select: 'full_name document contact email avatar role'
                })
                .populate({
                    path: 'owner_id.company_id',
                    select: 'company_name document logo'
                })
                .populate({
                    path: 'owner_id.user_id',
                    select: 'full_name document contact email'
                })
                .lean();

            if (!vehicle) throw new ResponseError(404, "No se encontró vehículo con esa placa");

            // Estructurar la respuesta con toda la información necesaria
            const driver = vehicle.driver_id as any;
            const ownerCompany = vehicle.owner_id?.company_id as any;
            const ownerUser = vehicle.owner_id?.user_id as any;

            return {
                vehicle: {
                    _id: vehicle._id,
                    n_numero_interno: (vehicle as any).n_numero_interno,
                    placa: vehicle.placa,
                    name: vehicle.name,
                    description: vehicle.description,
                    seats: vehicle.seats,
                    type: vehicle.type,
                    flota: vehicle.flota,
                    picture: vehicle.picture,
                    technical_sheet: (vehicle as any).technical_sheet,
                    possible_drivers: (vehicle as any).possible_drivers
                },
                conductor: driver ? {
                    _id: driver._id,
                    full_name: driver.full_name,
                    document: driver.document,
                    phone: driver.contact?.phone || '',
                    email: driver.email || driver.contact?.email,
                    avatar: driver.avatar
                } : null,
                propietario: {
                    type: vehicle.owner_id?.type,
                    company: ownerCompany ? {
                        _id: ownerCompany._id,
                        company_name: ownerCompany.company_name,
                        document: ownerCompany.document,
                        logo: ownerCompany.logo
                    } : null,
                    user: ownerUser ? {
                        _id: ownerUser._id,
                        full_name: ownerUser.full_name,
                        document: ownerUser.document,
                        phone: ownerUser.contact?.phone
                    } : null
                }
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo obtener el vehículo por placa");
        }
    }

    public async get_vehicle_documents({ vehicle_id }: { vehicle_id: string }) {
        try {
            const documents = await vhc_documentsModel
                .findOne({ vehicle_id })
                .populate('vehicle_id', 'placa name')
                .lean();

            if (!documents) throw new ResponseError(404, "No se encontraron documentos para este vehículo");

            return documents;
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudieron obtener los documentos del vehículo");
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

    public async generate_vehicle_technical_sheet_pdf({
        vehicle_id
    }: {
        vehicle_id: string;
    }): Promise<{ filename: string; buffer: Buffer }> {
        try {
            const vehicle = await vehicleModel
                .findById(vehicle_id)
                .populate("driver_id", "full_name document contact")
                .populate("owner_id.company_id", "company_name document logo")
                .lean();

            if (!vehicle) throw new ResponseError(404, "No se encontró el vehículo");

            const docs = await vhc_documentsModel.findOne({ vehicle_id }).lean();

            let company: any = (vehicle as any).owner_id?.company_id || null;
            if (!company && (vehicle as any).owner_id?.type === "User") {
                // fallback: empresa del conductor si existe
                const driver = (vehicle as any).driver_id;
                if (driver?.company_id) company = await companyModel.findById(String(driver.company_id)).lean();
            }

            const fechaExpedicion = dayjs(new Date()).format("DD/MM/YYYY HH:mm");
            const nit = company?.document?.number
                ? `${company.document.number}${company.document.dv ? "-" + company.document.dv : ""}`
                : "";

            const ts: any = (vehicle as any).technical_sheet || {};
            const driver: any = (vehicle as any).driver_id || {};

            const fmtDate = (d: any) => (d ? dayjs(d).format("DD/MM/YYYY") : "");

            const htmlTemplate = fs.readFileSync(this.resolveTemplatePath("ficha-tecnica-vehiculo.html"), "utf8");
            const html = this.replaceVariables(htmlTemplate, {
                fecha_expedicion: fechaExpedicion,
                company_name: company?.company_name || "",
                company_nit: nit,
                company_logo_url: company?.logo?.url || "",

                vehiculo_placa: (vehicle as any).placa || "",
                vehiculo_interno: (vehicle as any).n_numero_interno || "",
                vehiculo_tipo: (vehicle as any).type || "",
                vehiculo_flota: (vehicle as any).flota || "",
                vehiculo_seats: String((vehicle as any).seats || ""),

                marca: ts.marca || "",
                modelo: ts.modelo != null ? String(ts.modelo) : "",
                color: ts.color || "",
                combustible: ts.tipo_combustible || "",

                licencia_transito: ts.licencia_transito_numero || "",
                linea: ts.linea || "",
                cilindrada: ts.cilindrada_cc != null ? String(ts.cilindrada_cc) : "",
                servicio: ts.servicio || "",
                carroceria: ts.carroceria || "",
                chasis: ts.numero_chasis || "",
                fecha_matricula: fmtDate(ts.fecha_matricula),
                tarjeta_operacion: ts.tarjeta_operacion_numero || "",
                tarjeta_operacion_venc: fmtDate(ts.tarjeta_operacion_vencimiento || (docs as any)?.tarjeta_operacion_vencimiento),
                titular: ts.titular_licencia || "",
                motor: ts.numero_motor || "",
                serie: ts.numero_serie || "",
                importacion: ts.declaracion_importacion || "",

                soat_venc: fmtDate((docs as any)?.soat_vencimiento),
                tecnomecanica_venc: fmtDate((docs as any)?.tecnomecanica_vencimiento),
                seguro_venc: fmtDate((docs as any)?.seguro_vencimiento),

                conductor_nombre: driver.full_name || "",
                conductor_documento: driver?.document?.number ? String(driver.document.number) : "",
                conductor_telefono: driver?.contact?.phone || "",
            });

            const pdfBuffer = await renderHtmlToPdfBuffer(html);
            const safePlaca = String((vehicle as any).placa || "vehiculo").replace(/[^a-zA-Z0-9_-]/g, "");
            const filename = `ficha_tecnica_vehiculo_${safePlaca}_${dayjs().format("YYYYMMDD_HHmm")}.pdf`;
            return { filename, buffer: pdfBuffer };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo generar la ficha técnica del vehículo");
        }
    }

    public async update_vehicle_documents({
        vehicle_id,
        payload
    }: {
        vehicle_id: string,
        payload: {
            soat?: Express.Multer.File,
            tecnomecanica?: Express.Multer.File,
            seguro?: Express.Multer.File,
            licencia_transito?: Express.Multer.File,
            runt?: Express.Multer.File,
            soat_vencimiento?: Date,
            tecnomecanica_vencimiento?: Date,
            seguro_vencimiento?: Date,
            tarjeta_operacion_vencimiento?: Date
        }
    }) {
        try {
            const docs = await vhc_documentsModel.findOne({ vehicle_id });
            if (!docs) throw new ResponseError(404, "No se encontraron documentos para este vehículo");

            // Preparar borrado de archivos anteriores si se reemplazan
            const delete_ids: string[] = [];
            const maybePushDelete = (doc: any) => {
                if (doc?.public_id) delete_ids.push(doc.public_id);
            };

            // Subir archivos nuevos si vienen
            const uploads: Array<Promise<void>> = [];

            const setDoc = (key: "soat" | "tecnomecanica" | "seguro" | "licencia_transito" | "runt", file?: Express.Multer.File) => {
                if (!file) return;
                // borrar anterior si existe
                maybePushDelete((docs as any)[key]);
                uploads.push((async () => {
                    const uploaded = await upload_media({ file });
                    (docs as any)[key] = {
                        url: uploaded.secure_url,
                        public_id: uploaded.public_id,
                        type: file.mimetype.startsWith('image/') ? 'img' : 'file',
                        original_name: file.originalname,
                        file_extension: file.originalname.split('.').pop()
                    };
                })());
            };

            setDoc("soat", payload.soat);
            setDoc("tecnomecanica", payload.tecnomecanica);
            setDoc("seguro", payload.seguro);
            setDoc("licencia_transito", payload.licencia_transito);
            setDoc("runt", payload.runt);

            await Promise.all(uploads);

            // Actualizar vencimientos (si vienen)
            if (payload.soat_vencimiento) (docs as any).soat_vencimiento = payload.soat_vencimiento;
            if (payload.tecnomecanica_vencimiento) (docs as any).tecnomecanica_vencimiento = payload.tecnomecanica_vencimiento;
            if (payload.seguro_vencimiento) (docs as any).seguro_vencimiento = payload.seguro_vencimiento;
            if (payload.tarjeta_operacion_vencimiento) (docs as any).tarjeta_operacion_vencimiento = payload.tarjeta_operacion_vencimiento;

            // Borrar medios viejos después de subir los nuevos
            if (delete_ids.length > 0) {
                try { await delete_media(delete_ids); } catch (e) {}
            }

            await docs.save();
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudieron actualizar los documentos del vehículo");
        }
    }

    public async get_vehicle_operationals({ vehicle_id, page = 1, limit = 10 }: { 
        vehicle_id: string, 
        page?: number, 
        limit?: number 
    }) {
        try {
            const skip = (page - 1) * limit;

            const [operationals, total] = await Promise.all([
                vhc_operationalModel
                    .find({ vehicle_id })
                    .populate('uploaded_by', 'full_name')
                    .populate('vehicle_id', 'placa name')
                    .skip(skip)
                    .limit(limit)
                    .sort({ created: -1 })
                    .lean(),
                vhc_operationalModel.countDocuments({ vehicle_id })
            ]);

            return {
                operationals,
                pagination: {
                    current_page: page,
                    total_pages: Math.ceil(total / limit),
                    total_operationals: total,
                    limit,
                    has_next_page: page < Math.ceil(total / limit),
                    has_prev_page: page > 1
                }
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudieron obtener los registros operacionales del vehículo");
        }
    }

    public async get_vehicle_preoperationals({ vehicle_id, page = 1, limit = 10 }: { 
        vehicle_id: string, 
        page?: number, 
        limit?: number 
    }) {
        try {
            const skip = (page - 1) * limit;

            const [preoperationals, total] = await Promise.all([
                vhc_preoperationalModel
                    .find({ vehicle_id })
                    .populate('uploaded_by', 'full_name')
                    .populate('vehicle_id', 'placa name')
                    .skip(skip)
                    .limit(limit)
                    .sort({ created: -1 })
                    .lean(),
                vhc_preoperationalModel.countDocuments({ vehicle_id })
            ]);

            return {
                preoperationals,
                pagination: {
                    current_page: page,
                    total_pages: Math.ceil(total / limit),
                    total_preoperationals: total,
                    limit,
                    has_next_page: page < Math.ceil(total / limit),
                    has_prev_page: page > 1
                }
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudieron obtener los reportes preoperacionales del vehículo");
        }
    }

    public async get_last_operational_by_vehicle({ vehicle_id }: { vehicle_id: string }) {
        try {
            const lastOperational = await vhc_operationalModel
                .findOne({ vehicle_id })
                .populate('uploaded_by', 'full_name')
                .populate('vehicle_id', 'placa name')
                .sort({ created: -1 })
                .lean();

            return lastOperational;
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo obtener el último registro operacional del vehículo");
        }
    }

    public async get_last_preoperational_by_vehicle({ vehicle_id }: { vehicle_id: string }) {
        try {
            const lastPreoperational = await vhc_preoperationalModel
                .findOne({ vehicle_id })
                .populate('uploaded_by', 'full_name')
                .populate('vehicle_id', 'placa name')
                .sort({ created: -1 })
                .lean();

            return lastPreoperational;
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo obtener el último reporte preoperacional del vehículo");
        }
    }

    public async get_all_vehicles_last_reports({ company_id, page = 1, limit = 10 }: {
        company_id?: string,
        page?: number,
        limit?: number
    }) {
        try {
            const skip = (page - 1) * limit;

            // Construir query base para vehículos
            const vehicleQuery: any = {};
            if (company_id) {
                vehicleQuery.$or = [
                    { "owner_id.type": "Company", "owner_id.company_id": company_id }
                ];
            }

            // Obtener vehículos con paginación
            const [vehicles, total] = await Promise.all([
                vehicleModel
                    .find(vehicleQuery)
                    .populate('driver_id', 'full_name contact.phone')
                    .populate('owner_id.company_id', 'company_name')
                    .populate('owner_id.user_id', 'full_name')
                    .skip(skip)
                    .limit(limit)
                    .sort({ created: -1 })
                    .lean(),
                vehicleModel.countDocuments(vehicleQuery)
            ]);

            // Para cada vehículo, obtener el último operacional y preoperacional
            const vehiclesWithLastReports = await Promise.all(
                vehicles.map(async (vehicle) => {
                    const [lastOperational, lastPreoperational] = await Promise.all([
                        vhc_operationalModel
                            .findOne({ vehicle_id: vehicle._id })
                            .populate('uploaded_by', 'full_name')
                            .sort({ created: -1 })
                            .lean(),
                        vhc_preoperationalModel
                            .findOne({ vehicle_id: vehicle._id })
                            .populate('uploaded_by', 'full_name')
                            .sort({ created: -1 })
                            .lean()
                    ]);

                    return {
                        ...vehicle,
                        last_operational: lastOperational,
                        last_preoperational: lastPreoperational
                    };
                })
            );

            return {
                vehicles: vehiclesWithLastReports,
                pagination: {
                    current_page: page,
                    total_pages: Math.ceil(total / limit),
                    total_vehicles: total,
                    limit,
                    has_next_page: page < Math.ceil(total / limit),
                    has_prev_page: page > 1
                }
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudieron obtener los vehículos con sus últimos reportes");
        }
    }

    //* #========== PUT METHODS ==========#

    public async update_vehicle({ id, payload }: { id: string, payload: Vehicle }) {
        try {
            const vehicle = await vehicleModel.findById(id);
            if (!vehicle) throw new ResponseError(404, "No se encontro el vehiculo")
            await vehicle.updateOne(payload);
            await vehicle.save();
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo actualizar el vehiculo")
        }
    }

    public async update_vehicle_picture({ id, picture }: { id: string, picture: Express.Multer.File }) {
        try {
            const vehicle = await vehicleModel.findById(id);
            if (!vehicle) throw new ResponseError(404, "No se encontro el vehiculo")
            const uploaded_file = await upload_media({ file: picture });
            vehicle.picture = uploaded_file ? {
                url: uploaded_file.secure_url,
                public_id: uploaded_file.public_id,
                type: "img"
            } : DEFAULT_PROFILE;
            await vehicle.save();
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo actualizar la imagen del vehiculo")
        }
    }

    public async update_vehicle_owner({ id, owner_id }: { id: string, owner_id: Vehicle["owner_id"] }) {
        try {
            const vehicle = await vehicleModel.findById(id);
            if (!vehicle) throw new ResponseError(404, "No se encontro el vehiculo")
            vehicle.owner_id = owner_id;
            await vehicle.save();
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo actualizar el propietario del vehiculo")
        }
    }

    public async update_vehicle_driver({ id, driver_id }: { id: string, driver_id: Vehicle["driver_id"] }) {
        try {
            const vehicle = await vehicleModel.findById(id);
            if (!vehicle) throw new ResponseError(404, "No se encontro el vehiculo")
            vehicle.driver_id = driver_id;
            await vehicle.save();
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo actualizar el conductor del vehiculo")
        }
    }



    //* #========== PRIVATE METHODS ==========#
    private async verify_exist_vehicle({ placa, company_id }: { placa: string, company_id: string }) {
        try {
            // Buscar vehículo con la misma placa que pertenezca a la compañía
            const find = await vehicleModel.findOne({
                placa,
                $or: [
                    { "owner_id.type": "Company", "owner_id.company_id": company_id }
                ]
            });

            if (find) throw new ResponseError(409, "Este vehículo ya está registrado en la empresa")
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo validar la existencia del vehículo")
        }
    }
}