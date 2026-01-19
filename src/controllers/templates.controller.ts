import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { ResponseError } from "@/utils/errors";

export class TemplatesController {
    /**
     * Resuelve la ruta del archivo de plantilla
     * Busca primero en la raíz del proyecto (templates/) y luego en dist/templates/
     */
    private resolveTemplatePath(fileName: string): string {
        const cwd = process.cwd();
        const rootPath = path.join(cwd, "templates", fileName);
        const distPath = path.join(cwd, "dist", "templates", fileName);
        
        if (fs.existsSync(rootPath)) return rootPath;
        if (fs.existsSync(distPath)) return distPath;
        
        throw new ResponseError(404, `Plantilla ${fileName} no encontrada`);
    }

    /**
     * Descargar plantilla de gastos operacionales
     */
    public async download_operational_expenses_template(req: Request, res: Response): Promise<void> {
        try {
            const fileName = "plantilla-gastos-operacionales.xlsx";
            const filePath = this.resolveTemplatePath(fileName);

            // Verificar que el archivo existe
            if (!fs.existsSync(filePath)) {
                res.status(404).json({
                    ok: false,
                    message: `Plantilla ${fileName} no encontrada`
                });
                return;
            }

            // Leer el archivo
            const fileBuffer = fs.readFileSync(filePath);
            
            // Configurar headers para descarga
            res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
            res.setHeader("Content-Length", fileBuffer.length.toString());
            
            // Enviar el archivo
            res.status(200).send(fileBuffer);
        } catch (error) {
            if (error instanceof ResponseError) {
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al descargar la plantilla"
            });
            return;
        }
    }
}
