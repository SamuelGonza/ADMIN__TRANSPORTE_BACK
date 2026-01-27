import { Queue } from 'bullmq';
import RedisConnection from '@/config/redis.config';

// Tipos de trabajos de email
export enum EmailJobType {
    SEND_SOLICITUD_COMPLETE_EMAILS = 'send_solicitud_complete_emails',
    SEND_COORDINATOR_NEW_SOLICITUD = 'send_coordinator_new_solicitud',
    SEND_PRELIQUIDACION_TO_CLIENT = 'send_preliquidacion_to_client',
    SEND_VEHICLE_CREATED_ASSIGNED = 'send_vehicle_created_assigned',
    SEND_USER_CREDENTIALS = 'send_user_credentials',
    SEND_USER_VERIFICATION_OTP = 'send_user_verification_otp',
}

// Interfaz para los datos de los trabajos
export interface EmailJobData {
    type: EmailJobType;
    data: any;
}

class EmailQueue {
    private static instance: EmailQueue;
    private queue: Queue<EmailJobData> | null = null;

    private constructor() {}

    public static getInstance(): EmailQueue {
        if (!EmailQueue.instance) {
            EmailQueue.instance = new EmailQueue();
        }
        return EmailQueue.instance;
    }

    public initialize(): Queue<EmailJobData> {
        if (this.queue) {
            return this.queue;
        }

        const redisConnection = RedisConnection.getInstance();
        // Asegurar que Redis esté conectado
        redisConnection.connect();
        // Usar las opciones de conexión directamente para BullMQ
        const connectionOptions = redisConnection.getConnectionOptions();

        this.queue = new Queue<EmailJobData>('email-queue', {
            connection: connectionOptions,
            defaultJobOptions: {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 2000, // 2 segundos iniciales
                },
                removeOnComplete: {
                    age: 24 * 3600, // Mantener trabajos completados por 24 horas
                    count: 1000, // Mantener máximo 1000 trabajos completados
                },
                removeOnFail: {
                    age: 7 * 24 * 3600, // Mantener trabajos fallidos por 7 días
                },
            },
        });

        this.queue.on('error', (error) => {
            console.error('❌ Error en la cola de emails:', error);
        });

        console.log('✅ Cola de emails inicializada');
        return this.queue;
    }

    public getQueue(): Queue<EmailJobData> {
        if (!this.queue) {
            return this.initialize();
        }
        return this.queue;
    }

    public async addJob(jobType: EmailJobType, data: any): Promise<void> {
        const queue = this.getQueue();
        await queue.add(String(jobType), {
            type: jobType,
            data,
        });
        console.log(`📧 Trabajo de email encolado: ${jobType}`);
    }

    public async close(): Promise<void> {
        if (this.queue) {
            await this.queue.close();
            this.queue = null;
            console.log('🔌 Cola de emails cerrada');
        }
    }
}

export default EmailQueue;
