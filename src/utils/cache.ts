import RedisConnection from '@/config/redis.config';
import { Request } from 'express';

export interface CacheOptions {
    ttl?: number; // Time to live en segundos (default: 3600 = 1 hora)
    prefix?: string; // Prefijo para las claves de caché
}

class CacheService {
    private redis: ReturnType<typeof RedisConnection.prototype.getClient>;
    private defaultTTL: number = 3600; // 1 hora por defecto

    constructor() {
        this.redis = RedisConnection.getInstance().getClient();
    }

    /**
     * Genera una clave de caché basada en la ruta y los parámetros de la petición
     */
    private generateCacheKey(req: Request, prefix?: string): string {
        const baseKey = prefix || 'cache';
        const path = req.path;
        const queryString = JSON.stringify(req.query);
        const params = JSON.stringify(req.params);
        const user = (req as any).user;
        const userId = user?._id || 'anonymous';
        const userRole = user?.role || 'anonymous';
        
        // Incluir usuario y rol en la clave para evitar problemas de permisos
        return `${baseKey}:${path}:${queryString}:${params}:${userId}:${userRole}`;
    }

    /**
     * Obtiene un valor del caché
     */
    async get<T>(key: string): Promise<T | null> {
        try {
            const cached = await this.redis.get(key);
            if (cached) {
                return JSON.parse(cached) as T;
            }
            return null;
        } catch (error) {
            console.error('Error al obtener del caché:', error);
            return null;
        }
    }

    /**
     * Guarda un valor en el caché
     */
    async set(key: string, value: any, ttl?: number): Promise<void> {
        try {
            const expiration = ttl || this.defaultTTL;
            await this.redis.setex(key, expiration, JSON.stringify(value));
        } catch (error) {
            console.error('Error al guardar en caché:', error);
        }
    }

    /**
     * Elimina una clave del caché
     */
    async delete(key: string): Promise<void> {
        try {
            await this.redis.del(key);
        } catch (error) {
            console.error('Error al eliminar del caché:', error);
        }
    }

    /**
     * Elimina múltiples claves que coincidan con un patrón
     */
    async deletePattern(pattern: string): Promise<void> {
        try {
            const keys = await this.redis.keys(pattern);
            if (keys.length > 0) {
                await this.redis.del(...keys);
            }
        } catch (error) {
            console.error('Error al eliminar patrón del caché:', error);
        }
    }

    /**
     * Obtiene o establece un valor en caché basado en una función
     */
    async getOrSet<T>(
        key: string,
        fetchFn: () => Promise<T>,
        ttl?: number
    ): Promise<T> {
        const cached = await this.get<T>(key);
        if (cached !== null) {
            return cached;
        }

        const value = await fetchFn();
        await this.set(key, value, ttl);
        return value;
    }

    /**
     * Genera clave de caché para una petición HTTP
     */
    getCacheKey(req: Request, prefix?: string): string {
        return this.generateCacheKey(req, prefix);
    }

    /**
     * Invalidar caché de solicitudes
     */
    async invalidateSolicitudesCache(solicitudId?: string): Promise<void> {
        try {
            // Invalidar todas las solicitudes
            await this.deletePattern('cache:/solicitudes*');
            
            // Si se proporciona un ID específico, invalidar también ese
            if (solicitudId) {
                await this.deletePattern(`cache:/solicitudes/${solicitudId}*`);
                await this.deletePattern(`cache:/solicitudes/*/${solicitudId}*`);
            }
        } catch (error) {
            console.error('Error al invalidar caché de solicitudes:', error);
        }
    }

    /**
     * Invalidar caché de vehículos
     */
    async invalidateVehiclesCache(vehicleId?: string): Promise<void> {
        try {
            await this.deletePattern('cache:/vehicles*');
            if (vehicleId) {
                await this.deletePattern(`cache:/vehicles/${vehicleId}*`);
            }
        } catch (error) {
            console.error('Error al invalidar caché de vehículos:', error);
        }
    }

    /**
     * Invalidar caché de usuarios
     */
    async invalidateUsersCache(userId?: string): Promise<void> {
        try {
            await this.deletePattern('cache:/users*');
            if (userId) {
                await this.deletePattern(`cache:/users/${userId}*`);
            }
        } catch (error) {
            console.error('Error al invalidar caché de usuarios:', error);
        }
    }

    /**
     * Invalidar caché de clientes
     */
    async invalidateClientsCache(clientId?: string): Promise<void> {
        try {
            await this.deletePattern('cache:/clients*');
            await this.deletePattern('cache:/client_users*');
            if (clientId) {
                await this.deletePattern(`cache:/clients/${clientId}*`);
            }
        } catch (error) {
            console.error('Error al invalidar caché de clientes:', error);
        }
    }
}

export default new CacheService();
