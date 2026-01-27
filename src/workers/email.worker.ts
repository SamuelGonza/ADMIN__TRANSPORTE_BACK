import { Worker, Job } from 'bullmq';
import RedisConnection from '@/config/redis.config';
import { EmailJobType, EmailJobData } from '@/queues/email.queue';
import { SolicitudesService } from '@/services/solicitudes.service';
import { PreliquidacionService } from '@/services/preliquidacion.service';
import { VehicleServices } from '@/services/vehicles.service';
import { UserService } from '@/services/users.service';

class EmailWorker {
    private static instance: EmailWorker;
    private worker: Worker<EmailJobData> | null = null;

    private constructor() {}

    public static getInstance(): EmailWorker {
        if (!EmailWorker.instance) {
            EmailWorker.instance = new EmailWorker();
        }
        return EmailWorker.instance;
    }

    public initialize(): Worker<EmailJobData> {
        if (this.worker) {
            return this.worker;
        }

        const redisConnection = RedisConnection.getInstance();
        // Asegurar que Redis esté conectado
        redisConnection.connect();
        // Usar las opciones de conexión directamente para BullMQ
        const connectionOptions = redisConnection.getConnectionOptions();

        this.worker = new Worker<EmailJobData>(
            'email-queue',
            async (job: Job<EmailJobData>) => {
                return await this.processJob(job);
            },
            {
                connection: connectionOptions,
                concurrency: 5, // Procesar hasta 5 trabajos simultáneamente
                limiter: {
                    max: 10, // Máximo 10 trabajos
                    duration: 1000, // Por segundo
                },
            }
        );

        this.worker.on('completed', (job) => {
            console.log(`✅ Trabajo de email completado: ${job.id} - ${job.data.type}`);
        });

        this.worker.on('failed', (job, err) => {
            console.error(`❌ Trabajo de email fallido: ${job?.id} - ${job?.data.type}`, err);
        });

        this.worker.on('error', (error) => {
            console.error('❌ Error en el worker de emails:', error);
        });

        console.log('✅ Worker de emails inicializado');
        return this.worker;
    }

    private async processJob(job: Job<EmailJobData>): Promise<any> {
        const { type, data } = job.data;

        try {
            switch (type) {
                case EmailJobType.SEND_SOLICITUD_COMPLETE_EMAILS:
                    return await this.handleSendSolicitudCompleteEmails(data);

                case EmailJobType.SEND_COORDINATOR_NEW_SOLICITUD:
                    return await this.handleSendCoordinatorNewSolicitud(data);

                case EmailJobType.SEND_PRELIQUIDACION_TO_CLIENT:
                    return await this.handleSendPreliquidacionToClient(data);

                case EmailJobType.SEND_VEHICLE_CREATED_ASSIGNED:
                    return await this.handleSendVehicleCreatedAssigned(data);

                case EmailJobType.SEND_USER_CREDENTIALS:
                    return await this.handleSendUserCredentials(data);

                case EmailJobType.SEND_USER_VERIFICATION_OTP:
                    return await this.handleSendUserVerificationOtp(data);

                default:
                    throw new Error(`Tipo de trabajo desconocido: ${type}`);
            }
        } catch (error) {
            console.error(`Error procesando trabajo ${type}:`, error);
            throw error; // Re-lanzar para que BullMQ maneje el reintento
        }
    }

    private async handleSendSolicitudCompleteEmails(data: { solicitud_id: string }): Promise<void> {
        const solicitudesService = new SolicitudesService();
        await solicitudesService.send_emails_solicitud_complete({
            solicitud_id: data.solicitud_id,
        });
    }

    private async handleSendCoordinatorNewSolicitud(data: {
        coordinator_name: string;
        coordinator_email: string;
        client_name: string;
        fecha: string;
        hora_inicio: string;
        origen: string;
        destino: string;
        n_pasajeros: number;
    }): Promise<void> {
        const { send_coordinator_new_solicitud } = await import('@/email/index.email');
        await send_coordinator_new_solicitud(data);
    }

    private async handleSendPreliquidacionToClient(data: {
        preliquidacion_id: string;
        user_id: string;
        notas?: string;
    }): Promise<void> {
        // Reutilizar la lógica del servicio pero solo para generar PDF y enviar email
        // La actualización de BD ya se hizo antes de encolar el trabajo
        const preliquidacionService = new PreliquidacionService();
        const preliquidacionModel = (await import('@/models/preliquidacion.model')).default;
        const userModel = (await import('@/models/user.model')).default;
        const { CompanyService } = await import('@/services/company.service');
        const { ResponseError } = await import('@/utils/errors');

        // Obtener preliquidación con solicitudes pobladas
        const preliquidacionConSolicitudes = await preliquidacionModel.findById(data.preliquidacion_id)
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
        const vehicles: any[] = [];
        for (const solicitud of solicitudes) {
            if ((solicitud as any).vehiculo_id) {
                vehicles.push((solicitud as any).vehiculo_id);
            }
            if ((solicitud as any).vehicle_assignments && Array.isArray((solicitud as any).vehicle_assignments)) {
                for (const assignment of (solicitud as any).vehicle_assignments) {
                    if (assignment.vehiculo_id) {
                        vehicles.push(assignment.vehiculo_id);
                    }
                }
            }
        }

        if (vehicles.length === 0) {
            throw new ResponseError(400, "No se encontraron vehículos en las solicitudes");
        }

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

        const companyService = new CompanyService();
        const company = await companyService.get_company_by({ company_id: propietarioCompanyId });

        if (!company) {
            throw new ResponseError(400, "No se pudo obtener la información del propietario del vehículo");
        }

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
        const { filename, buffer } = await preliquidacionService.generate_preliquidacion_pdf({
            preliquidacion_id: data.preliquidacion_id
        });

        // Enviar email
        const { send_client_preliquidacion } = await import("@/email/index.email");
        await send_client_preliquidacion({
            client_name: companyContact.full_name || company.company_name,
            client_email: companyContact.email,
            company_name: company.company_name || "Admin Transporte",
            preliquidacion_numero: (preliquidacionConSolicitudes as any).numero,
            preliquidacion_pdf: { filename, buffer },
            notas: data.notas,
            dashboard_link: process.env.FRONTEND_URL || ""
        });
    }

    private async handleSendVehicleCreatedAssigned(data: {
        owner_name: string;
        owner_email: string;
        placa: string;
        vehicle_name: string;
        type: string;
        flota: string;
        driver_name: string;
    }): Promise<void> {
        const { send_vehicle_created_assigned } = await import('@/email/index.email');
        await send_vehicle_created_assigned(data);
    }

    private async handleSendUserCredentials(data: {
        full_name: string;
        email: string;
        password: string;
        role: string;
    }): Promise<void> {
        const { send_user_credentials } = await import('@/email/index.email');
        await send_user_credentials(data);
    }

    private async handleSendUserVerificationOtp(data: {
        full_name: string;
        email: string;
        otp_code: string;
    }): Promise<void> {
        const { send_user_verification_otp } = await import('@/email/index.email');
        await send_user_verification_otp(data);
    }

    public getWorker(): Worker<EmailJobData> | null {
        return this.worker;
    }

    public async close(): Promise<void> {
        if (this.worker) {
            await this.worker.close();
            this.worker = null;
            console.log('🔌 Worker de emails cerrado');
        }
    }
}

export default EmailWorker;
