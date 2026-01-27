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
import EmailQueue, { EmailJobType } from '@/queues/email.queue';
import companyModel from '@/models/company.model';
import userModel from '@/models/user.model';
import { delete_media } from '@/utils/cloudinary';
import fs from "fs";
import path from "path";
import dayjs from "dayjs";
import { renderHtmlToPdfBuffer } from "@/utils/pdf";
import * as XLSX from 'xlsx';
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

            // Validar que driver_id esté presente
            if (!driver_id) {
                throw new ResponseError(400, "driver_id es requerido");
            }

            // Validaciones que se pueden ejecutar en paralelo
            const validationPromises = [
                this.verify_exist_vehicle({ placa, company_id }),
                VehicleServices.UserService.verify_exist_user_by_id({ id: String(driver_id) })
            ];

            // Validar possible_drivers si existen
            if (possible_drivers && Array.isArray(possible_drivers) && possible_drivers.length > 0) {
                for (const possibleDriverId of possible_drivers) {
                    if (possibleDriverId) {
                        validationPromises.push(
                            VehicleServices.UserService.verify_exist_user_by_id({ id: String(possibleDriverId) })
                        );
                    }
                }
            }

            // Agregar validaciones según el tipo de propietario
            if (owner_id.type === "Company") {
                if (!owner_id.company_id) {
                    throw new ResponseError(400, "owner_id.company_id es requerido cuando owner_id.type es 'Company'");
                }
                validationPromises.push(
                    VehicleServices.CompanyService.verify_exist_company_by_id(String(owner_id.company_id))
                );
            } else if (owner_id.type === "User") {
                if (!owner_id.user_id) {
                    throw new ResponseError(400, "owner_id.user_id es requerido cuando owner_id.type es 'User'");
                }
                validationPromises.push(
                    VehicleServices.UserService.verify_exist_user_by_id({ id: String(owner_id.user_id) })
                );
            } else {
                throw new ResponseError(400, "owner_id.type debe ser 'Company' o 'User'");
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
                        const emailQueue = EmailQueue.getInstance();
                        await emailQueue.addJob(EmailJobType.SEND_VEHICLE_CREATED_ASSIGNED, {
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
                    const emailQueue = EmailQueue.getInstance();
                    await emailQueue.addJob(EmailJobType.SEND_VEHICLE_CREATED_ASSIGNED, {
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
            // Log del error para debugging
            console.error("Error en create_new_vehicle:", error);
            const errorMessage = error instanceof Error ? error.message : "Error desconocido";
            throw new ResponseError(500, `No se pudo crear el vehículo: ${errorMessage}`)
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
        bills
    }: {
        vehicle_id: string,
        user_id: string,
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

            // Crear el documento de gastos operacionales
            const operational = await vhc_operationalModel.create({
                vehicle_id,
                uploaded_by: user_id,
                bills: processedBills,
                estado: "no_liquidado",
                created: new Date()
            });

            await operational.save();

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
     * Buscar vehículos por placa con autocomplete (búsqueda parcial)
     * Devuelve múltiples resultados con todos los IDs populizados
     */
    public async search_vehicles_by_placa({ placa, company_id, limit = 10 }: { placa: string, company_id?: string, limit?: number }) {
        try {
            if (!placa || placa.trim().length === 0) {
                return [];
            }

            // Construir query para búsqueda parcial (case-insensitive)
            // Primero buscar TODOS los vehículos con esa placa, sin filtrar por company_id
            const query: any = { 
                placa: { $regex: placa.trim().toUpperCase(), $options: 'i' } 
            };

            // Obtener todos los vehículos con esa placa (sin filtrar por company_id todavía)
            const vehicles = await vehicleModel
                .find(query)
                .populate({
                    path: 'driver_id',
                    select: 'full_name document contact email avatar role company_id'
                })
                .populate({
                    path: 'possible_drivers',
                    select: 'full_name document contact email avatar role company_id'
                })
                .populate({
                    path: 'owner_id.company_id',
                    select: 'company_name document logo'
                })
                .populate({
                    path: 'owner_id.user_id',
                    select: 'full_name document contact email'
                })
                .limit(limit * 3) // Obtener más resultados para filtrar después
                .sort({ placa: 1 }) // Ordenar por placa
                .lean();

            // Si no hay company_id, retornar todos los resultados
            if (!company_id) {
                return vehicles.slice(0, limit).map((vehicle: any) => {
                    const driver = vehicle.driver_id as any;
                    const ownerCompany = vehicle.owner_id?.company_id as any;
                    const ownerUser = vehicle.owner_id?.user_id as any;

                    return {
                        _id: vehicle._id,
                        n_numero_interno: vehicle.n_numero_interno,
                        placa: vehicle.placa,
                        name: vehicle.name,
                        description: vehicle.description,
                        seats: vehicle.seats,
                        type: vehicle.type,
                        flota: vehicle.flota,
                        picture: vehicle.picture,
                        technical_sheet: vehicle.technical_sheet,
                        possible_drivers: vehicle.possible_drivers,
                        conductor: driver ? {
                            _id: driver._id,
                            full_name: driver.full_name,
                            document: driver.document,
                            phone: driver.contact?.phone || '',
                            email: driver.email || driver.contact?.email,
                            avatar: driver.avatar,
                            role: driver.role,
                            company_id: driver.company_id
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
                });
            }

            // Filtrar vehículos según company_id
            // Incluir: propios, de usuarios de la compañía, y afiliados donde el conductor pertenece a la compañía
            const filteredVehicles = vehicles.filter((vehicle: any) => {
                // Normalizar IDs para comparación
                const normalizeId = (id: any) => {
                    if (!id) return null;
                    if (typeof id === 'string') return id;
                    return String(id._id || id);
                };

                const targetCompanyId = String(company_id);
                
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
            }).slice(0, limit);

            // Formatear la respuesta
            return filteredVehicles.map((vehicle: any) => {
                const driver = vehicle.driver_id as any;
                const ownerCompany = vehicle.owner_id?.company_id as any;
                const ownerUser = vehicle.owner_id?.user_id as any;

                return {
                    _id: vehicle._id,
                    n_numero_interno: vehicle.n_numero_interno,
                    placa: vehicle.placa,
                    name: vehicle.name,
                    description: vehicle.description,
                    seats: vehicle.seats,
                    type: vehicle.type,
                    flota: vehicle.flota,
                    picture: vehicle.picture,
                    technical_sheet: vehicle.technical_sheet,
                    possible_drivers: vehicle.possible_drivers,
                    conductor: driver ? {
                        _id: driver._id,
                        full_name: driver.full_name,
                        document: driver.document,
                        phone: driver.contact?.phone || '',
                        email: driver.email || driver.contact?.email,
                        avatar: driver.avatar,
                        role: driver.role,
                        company_id: driver.company_id
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
            });
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudieron buscar los vehículos por placa");
        }
    }

    /**
     * Buscar vehículo por placa con toda la información del conductor y propietario
     * Útil para asignar vehículos a solicitudes ingresando solo la placa
     */
    public async get_vehicle_by_placa({ placa, company_id }: { placa: string, company_id?: string }) {
        try {
            // Buscar vehículo por placa (búsqueda exacta, case-insensitive)
            const query: any = { 
                placa: { $regex: `^${placa.toUpperCase().trim()}$`, $options: 'i' } 
            };

            // Buscar TODOS los vehículos con esa placa primero (sin filtrar por company_id)
            const vehicles = await vehicleModel
                .find(query)
                .populate({
                    path: 'driver_id',
                    select: 'full_name document contact email avatar role company_id'
                })
                .populate({
                    path: 'possible_drivers',
                    select: 'full_name document contact email avatar role company_id'
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

            if (!vehicles || vehicles.length === 0) {
                throw new ResponseError(404, "No se encontró vehículo con esa placa");
            }

            // Helper para formatear la respuesta en el formato esperado por get_vehicle_by_placa
            const formatVehicleResponseForPlaca = (v: any) => {
                const driver = v.driver_id as any;
                const ownerCompany = v.owner_id?.company_id as any;
                const ownerUser = v.owner_id?.user_id as any;

                return {
                    vehicle: {
                        _id: v._id,
                        n_numero_interno: v.n_numero_interno,
                        placa: v.placa,
                        name: v.name,
                        description: v.description,
                        seats: v.seats,
                        type: v.type,
                        flota: v.flota,
                        picture: v.picture,
                        technical_sheet: v.technical_sheet,
                        possible_drivers: v.possible_drivers
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
                        type: v.owner_id?.type,
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
            };

            // Si no hay company_id, retornar el primer vehículo encontrado
            if (!company_id) {
                const vehicle = vehicles[0];
                return formatVehicleResponseForPlaca(vehicle);
            }

            // Filtrar vehículos según company_id (misma lógica que search_vehicles_by_placa)
            const normalizeId = (id: any) => {
                if (!id) return null;
                if (typeof id === 'string') return id;
                return String(id._id || id);
            };

            const targetCompanyId = String(company_id);
            
            // Buscar vehículo que coincida con la compañía
            let vehicle = vehicles.find((v: any) => {
                // 1. Vehículos propios: owner_id.company_id coincide
                const ownerCompanyId = normalizeId(v.owner_id?.company_id);
                if (ownerCompanyId === targetCompanyId) {
                    return true;
                }

                // 2. Vehículos de usuarios: verificar si el usuario tiene company_id que coincide
                if (v.owner_id?.type === "User" && v.owner_id?.user_id) {
                    const userId = v.owner_id.user_id;
                    if (userId.company_id) {
                        const userCompanyId = normalizeId(userId.company_id);
                        if (userCompanyId === targetCompanyId) {
                            return true;
                        }
                    }
                }

                // 3. Vehículos afiliados: verificar que el conductor pertenezca a la compañía
                if (v.flota === "afiliado") {
                    if (v.driver_id) {
                        const driverCompanyId = normalizeId(v.driver_id?.company_id);
                        if (driverCompanyId === targetCompanyId) {
                            return true;
                        }
                    }
                    // También verificar possible_drivers
                    if (v.possible_drivers && Array.isArray(v.possible_drivers) && v.possible_drivers.length > 0) {
                        const hasDriverWithCompany = v.possible_drivers.some((driver: any) => {
                            const driverCompanyId = normalizeId(driver?.company_id);
                            return driverCompanyId === targetCompanyId;
                        });
                        if (hasDriverWithCompany) {
                            return true;
                        }
                    }
                }

                // 4. Vehículos externos: si el conductor pertenece a la compañía
                if (v.flota === "externo") {
                    const driverCompanyId = normalizeId(v.driver_id?.company_id);
                    if (driverCompanyId === targetCompanyId) {
                        return true;
                    }
                }

                return false;
            });

            if (!vehicle) {
                throw new ResponseError(404, "No se encontró vehículo con esa placa para esta compañía");
            }

            return formatVehicleResponseForPlaca(vehicle);
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
                documentos_images: "",
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

    /**
     * Exportar vehículos a Excel
     * Puede exportar todos, filtrar por tipo/flota, o exportar vehículos seleccionados por IDs
     */
    public async export_vehicles_to_excel({
        vehicle_ids,
        filters = {}
    }: {
        vehicle_ids?: string[];
        filters?: {
            type?: VehicleTypes;
            flota?: "externo" | "propio" | "afiliado";
            placa?: string;
            name?: string;
        };
    }): Promise<Buffer> {
        try {
            // Construir query
            const query: any = {};

            // Si se proporcionan IDs específicos, usar solo esos
            if (vehicle_ids && vehicle_ids.length > 0) {
                query._id = { $in: vehicle_ids };
            }

            // Aplicar filtros adicionales
            if (filters.type) {
                query.type = filters.type;
            }

            if (filters.flota) {
                query.flota = filters.flota;
            }

            if (filters.placa) {
                query.placa = { $regex: filters.placa, $options: 'i' };
            }

            if (filters.name) {
                query.name = { $regex: filters.name, $options: 'i' };
            }

            // Obtener vehículos con todas las relaciones necesarias
            const vehicles = await vehicleModel
                .find(query)
                .populate({
                    path: 'driver_id',
                    select: 'full_name document contact email',
                    match: { is_delete: false, is_active: true }
                })
                .populate('owner_id.company_id', 'company_name document')
                .populate('owner_id.user_id', 'full_name document contact')
                .sort({ created: -1 })
                .lean();

            // Preparar datos para Excel
            const excelData: any[] = [
                [
                    'Placa',
                    'N° Interno',
                    'Nombre',
                    'Tipo',
                    'Flota',
                    'Capacidad (Pasajeros)',
                    'Conductor',
                    'Documento Conductor',
                    'Teléfono Conductor',
                    'Email Conductor',
                    'Propietario Tipo',
                    'Propietario Nombre',
                    'Propietario Documento',
                    'Marca',
                    'Modelo',
                    'Color',
                    'Combustible',
                    'Licencia Tránsito',
                    'Línea',
                    'Cilindrada (CC)',
                    'Servicio',
                    'Carrocería',
                    'N° Chasis',
                    'Fecha Matrícula',
                    'Tarjeta Operación',
                    'Venc. Tarjeta Operación',
                    'Titular Licencia',
                    'N° Motor',
                    'N° Serie',
                    'Declaración Importación',
                    'Fecha Creación'
                ]
            ];

            // Formatear fecha
            const fmtDate = (d: any) => (d ? dayjs(d).format("DD/MM/YYYY") : "");

            // Procesar cada vehículo
            vehicles.forEach((vehicle: any) => {
                const ts = vehicle.technical_sheet || {};
                const driver = vehicle.driver_id || {};
                const ownerCompany = vehicle.owner_id?.company_id || {};
                const ownerUser = vehicle.owner_id?.user_id || {};

                // Determinar tipo de propietario y nombre
                let propietarioTipo = "";
                let propietarioNombre = "";
                let propietarioDocumento = "";

                if (vehicle.owner_id?.type === "Company" && ownerCompany) {
                    propietarioTipo = "Empresa";
                    propietarioNombre = ownerCompany.company_name || "";
                    propietarioDocumento = ownerCompany.document?.number 
                        ? `${ownerCompany.document.number}${ownerCompany.document.dv ? "-" + ownerCompany.document.dv : ""}`
                        : "";
                } else if (vehicle.owner_id?.type === "User" && ownerUser) {
                    propietarioTipo = "Usuario";
                    propietarioNombre = ownerUser.full_name || "";
                    propietarioDocumento = ownerUser.document?.number 
                        ? `${ownerUser.document.type || ""} ${ownerUser.document.number}${ownerUser.document.dv ? "-" + ownerUser.document.dv : ""}`
                        : "";
                }

                excelData.push([
                    vehicle.placa || "",
                    vehicle.n_numero_interno || "",
                    vehicle.name || "",
                    vehicle.type || "",
                    vehicle.flota || "",
                    vehicle.seats || 0,
                    driver.full_name || "",
                    driver.document?.number 
                        ? `${driver.document.type || ""} ${driver.document.number}${driver.document.dv ? "-" + driver.document.dv : ""}`
                        : "",
                    driver.contact?.phone || "",
                    driver.email || "",
                    propietarioTipo,
                    propietarioNombre,
                    propietarioDocumento,
                    ts.marca || "",
                    ts.modelo != null ? String(ts.modelo) : "",
                    ts.color || "",
                    ts.tipo_combustible || "",
                    ts.licencia_transito_numero || "",
                    ts.linea || "",
                    ts.cilindrada_cc != null ? String(ts.cilindrada_cc) : "",
                    ts.servicio || "",
                    ts.carroceria || "",
                    ts.numero_chasis || "",
                    fmtDate(ts.fecha_matricula),
                    ts.tarjeta_operacion_numero || "",
                    fmtDate(ts.tarjeta_operacion_vencimiento),
                    ts.titular_licencia || "",
                    ts.numero_motor || "",
                    ts.numero_serie || "",
                    ts.declaracion_importacion || "",
                    fmtDate(vehicle.created)
                ]);
            });

            // Crear workbook y worksheet
            const workbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.aoa_to_sheet(excelData);

            // Ajustar ancho de columnas
            worksheet['!cols'] = [
                { wch: 12 }, // Placa
                { wch: 12 }, // N° Interno
                { wch: 20 }, // Nombre
                { wch: 12 }, // Tipo
                { wch: 12 }, // Flota
                { wch: 15 }, // Capacidad
                { wch: 25 }, // Conductor
                { wch: 20 }, // Documento Conductor
                { wch: 15 }, // Teléfono Conductor
                { wch: 25 }, // Email Conductor
                { wch: 15 }, // Propietario Tipo
                { wch: 25 }, // Propietario Nombre
                { wch: 20 }, // Propietario Documento
                { wch: 15 }, // Marca
                { wch: 12 }, // Modelo
                { wch: 12 }, // Color
                { wch: 15 }, // Combustible
                { wch: 18 }, // Licencia Tránsito
                { wch: 15 }, // Línea
                { wch: 15 }, // Cilindrada
                { wch: 15 }, // Servicio
                { wch: 15 }, // Carrocería
                { wch: 18 }, // N° Chasis
                { wch: 15 }, // Fecha Matrícula
                { wch: 18 }, // Tarjeta Operación
                { wch: 18 }, // Venc. Tarjeta Operación
                { wch: 25 }, // Titular Licencia
                { wch: 15 }, // N° Motor
                { wch: 15 }, // N° Serie
                { wch: 20 }, // Declaración Importación
                { wch: 15 }  // Fecha Creación
            ];

            XLSX.utils.book_append_sheet(workbook, worksheet, 'Vehículos');

            // Generar buffer
            const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

            return excelBuffer;
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, `Error al exportar vehículos a Excel: ${error instanceof Error ? error.message : 'Error desconocido'}`);
        }
    }
}