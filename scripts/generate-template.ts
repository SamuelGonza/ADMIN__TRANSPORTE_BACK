import { saveTemplateToFile } from '../src/utils/generate-excel-template';

const outputPath = process.argv[2] || './templates/plantilla-gastos-operacionales.xlsx';
const savedPath = saveTemplateToFile(outputPath);
console.log(`✅ Plantilla generada exitosamente en: ${savedPath}`);
