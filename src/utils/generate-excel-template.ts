import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Genera una plantilla Excel para subir gastos operacionales
 * Columnas: Tipo de Gasto, Valor, Descripción, Placa del Vehículo
 */
export function generateOperationalBillsTemplate(): Buffer {
    // Crear un nuevo workbook
    const workbook = XLSX.utils.book_new();

    // Datos de ejemplo para la plantilla
    const data = [
        // Encabezados
        ['Tipo de Gasto', 'Valor', 'Descripción', 'Placa del Vehículo'],
        // Filas de ejemplo
        ['fuel', 150000, 'Tanqueo completo estación Terpel', 'ABC123'],
        ['tolls', 45000, 'Peajes ruta Bogotá-Medellín', 'ABC123'],
        ['repairs', 200000, 'Cambio de llantas', 'XYZ789'],
        ['fines', 50000, 'Multa por exceso de velocidad', 'XYZ789'],
        ['parking_lot', 15000, 'Parqueadero centro comercial', 'ABC123'],
    ];

    // Crear worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(data);

    // Ajustar ancho de columnas
    worksheet['!cols'] = [
        { wch: 20 }, // Tipo de Gasto
        { wch: 15 }, // Valor
        { wch: 40 }, // Descripción
        { wch: 20 }, // Placa del Vehículo
    ];

    // Agregar validación de datos (dropdown para Tipo de Gasto)
    // Nota: xlsx no soporta validación directamente, pero podemos agregar comentarios
    const headerRow = worksheet['A1'];
    if (headerRow) {
        headerRow.c = [
            { a: 'Sistema', t: 'Tipo de Gasto válidos: fuel, tolls, repairs, fines, parking_lot' }
        ];
    }

    // Agregar worksheet al workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Gastos Operacionales');

    // Generar buffer del Excel
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return excelBuffer;
}

/**
 * Guarda la plantilla Excel en el sistema de archivos
 */
export function saveTemplateToFile(outputPath?: string): string {
    const buffer = generateOperationalBillsTemplate();
    
    const defaultPath = path.join(process.cwd(), 'templates', 'plantilla-gastos-operacionales.xlsx');
    const finalPath = outputPath || defaultPath;

    // Crear directorio si no existe
    const dir = path.dirname(finalPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    // Escribir archivo
    fs.writeFileSync(finalPath, buffer);

    return finalPath;
}
