import { InitiConnection } from "./config/db.config";
import app from "./srv_config";
import { GLOBAL_ENV } from "./utils/constants";
import { BitacoraCron } from "./cron/bitacora.cron";
import RedisConnection from "./config/redis.config";
import EmailQueue from "./queues/email.queue";
import EmailWorker from "./workers/email.worker";

class Server {
    private port: number;
    private dbConnection: InitiConnection;
    private bitacoraCron: BitacoraCron;
    private redisConnection: RedisConnection;
    private emailQueue: EmailQueue;
    private emailWorker: EmailWorker;

    constructor() {
        this.port = parseInt(GLOBAL_ENV.PORT) || 3000;
        this.dbConnection = InitiConnection.getInstance();
        this.bitacoraCron = new BitacoraCron();
        this.redisConnection = RedisConnection.getInstance();
        this.emailQueue = EmailQueue.getInstance();
        this.emailWorker = EmailWorker.getInstance();
        this.initializeRedis();
        this.startServer();
        this.initializeCronJobs();
    }

    private initializeRedis(): void {
        try {
            // Conectar a Redis
            this.redisConnection.connect();
            
            // Inicializar cola de emails
            this.emailQueue.initialize();
            
            // Inicializar worker de emails
            this.emailWorker.initialize();
            
            console.log('✅ Redis, cola y worker de emails inicializados');
        } catch (error) {
            console.error('❌ Error al inicializar Redis/Queue/Worker:', error);
            // No lanzar error para que el servidor pueda iniciar aunque Redis falle
            // Los trabajos simplemente fallarán y se reintentarán cuando Redis esté disponible
        }
    }

    private async initializeCronJobs(): Promise<void> {
        try {
            // Esperar un poco para asegurar que la conexión a la BD esté lista
            setTimeout(async () => {
                await this.bitacoraCron.runNow();
                this.bitacoraCron.start();
            }, 3000); // Esperar 3 segundos para que la BD esté lista
        } catch (error) {
            console.error("❌ Error al inicializar cron jobs:", error);
        }
    }

    private startServer(): void {
        try {
            app.listen(this.port, () => {
                console.log(`🚀 Servidor corriendo en puerto ${this.port}`);
            })
        } catch (error) {
            console.log("❌ Error al iniciar el servidor", error);
            process.exit(1);
        }
    }

    public async shutDown(): Promise<void> {
        try {
            console.log("🔄 Cerrando servidor");
            this.bitacoraCron.stop();
            
            // Cerrar worker y cola de emails
            try {
                await this.emailWorker.close();
                await this.emailQueue.close();
            } catch (error) {
                console.error("Error al cerrar worker/cola de emails:", error);
            }
            
            // Desconectar Redis
            try {
                await this.redisConnection.disconnect();
            } catch (error) {
                console.error("Error al desconectar Redis:", error);
            }
            
            await this.dbConnection.disconnect();
            process.exit(0);
        } catch (error) {
            console.log("❌ Error al cerrar el servidor", error);
            process.exit(1);
        }
    }
}

const server = new Server();

process.on("SIGINT", async () => {
    await server.shutDown();
});

process.on("SIGTERM", async () => {
    await server.shutDown();
});

process.on('uncaughtException', (error) => {
    console.error('❌ Error no capturado:', error);
    server.shutDown();
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promesa rechazada no manejada:', reason);
    console.error('📍 En la promesa:', promise);
    server.shutDown();
});

export default server;