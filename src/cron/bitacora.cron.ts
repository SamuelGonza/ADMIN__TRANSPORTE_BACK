import * as cron from "node-cron";
import { BitacoraCronService } from "@/services/bitacora-cron.service";

/**
 * Configuración de cron jobs para bitácoras
 */
export class BitacoraCron {
    private bitacoraService: BitacoraCronService;
    private cronJob: cron.ScheduledTask | null = null;

    constructor() {
        this.bitacoraService = new BitacoraCronService();
    }

    /**
     * Inicia el cron job que se ejecuta cada hora
     * Verifica y crea bitácoras para el mes actual solamente si no existe
     */
    public start(): void {
        // Ejecutar cada hora (minuto 0 de cada hora)
        // Formato: minuto hora día mes día-semana
        // '0 * * * *' = cada hora en el minuto 0
        this.cronJob = cron.schedule('0 * * * *', async () => {
            try {
                console.log("⏰ Ejecutando verificación automática de bitácoras...");
                await this.bitacoraService.ensureBitacorasForAllCompanies();
            } catch (error) {
                console.error("❌ Error en cron job de bitácoras:", error);
            }
        }, {
            timezone: "America/Bogota" // Ajustar según la zona horaria del servidor
        });

        console.log("✅ Cron job de bitácoras iniciado (se ejecuta cada hora)");
    }

    /**
     * Ejecuta la verificación inmediatamente (útil para testing o inicialización)
     */
    public async runNow(): Promise<void> {
        try {
            console.log("🔄 Ejecutando verificación inmediata de bitácoras...");
            await this.bitacoraService.ensureBitacorasForAllCompanies();
            console.log("✅ Verificación inmediata completada");
        } catch (error) {
            console.error("❌ Error en verificación inmediata:", error);
            throw error;
        }
    }


    /**
     * Detiene el cron job
     */
    public stop(): void {
        if (this.cronJob) {
            this.cronJob.stop();
            console.log("🛑 Cron job de bitácoras detenido");
        }
    }
}
