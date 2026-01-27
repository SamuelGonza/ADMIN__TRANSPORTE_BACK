import Redis, { type RedisOptions } from 'ioredis';
import { GLOBAL_ENV } from '@/utils/constants';

class RedisConnection {
    private static instance: RedisConnection;
    private redisClient: Redis | null = null;

    private constructor() {}

    public static getInstance(): RedisConnection {
        if (!RedisConnection.instance) {
            RedisConnection.instance = new RedisConnection();
        }
        return RedisConnection.instance;
    }

    public connect(): Redis {
        if (this.redisClient) {
            return this.redisClient;
        }

        const redisOptions: RedisOptions = {
            host: GLOBAL_ENV.REDIS_HOST,
            port: GLOBAL_ENV.REDIS_PORT,
            db: GLOBAL_ENV.REDIS_DB,
            retryStrategy: (times: number) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            maxRetriesPerRequest: 3,
        };

        if (GLOBAL_ENV.REDIS_PASSWORD) {
            redisOptions.password = GLOBAL_ENV.REDIS_PASSWORD;
        }

        this.redisClient = new Redis(redisOptions);

        this.redisClient.on('connect', () => {
            console.log('✅ Conexión a Redis establecida');
        });

        this.redisClient.on('error', (error) => {
            console.error('❌ Error en conexión a Redis:', error);
        });

        this.redisClient.on('close', () => {
            console.log('⚠️ Conexión a Redis cerrada');
        });

        return this.redisClient;
    }

    public getClient(): Redis {
        if (!this.redisClient) {
            return this.connect();
        }
        return this.redisClient;
    }

    public getConnectionOptions(): RedisOptions {
        const redisOptions: RedisOptions = {
            host: GLOBAL_ENV.REDIS_HOST,
            port: GLOBAL_ENV.REDIS_PORT,
            db: GLOBAL_ENV.REDIS_DB,
            retryStrategy: (times: number) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            maxRetriesPerRequest: null, // BullMQ requiere null para manejar los reintentos
        };

        if (GLOBAL_ENV.REDIS_PASSWORD) {
            redisOptions.password = GLOBAL_ENV.REDIS_PASSWORD;
        }

        return redisOptions;
    }

    public async disconnect(): Promise<void> {
        if (this.redisClient) {
            await this.redisClient.quit();
            this.redisClient = null;
            console.log('🔌 Desconectado de Redis');
        }
    }
}

export default RedisConnection;
