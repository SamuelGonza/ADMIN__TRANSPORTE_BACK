import multer, { FileFilterCallback } from "multer";
import { Request } from "express";

const storage = multer.memoryStorage();

const fileFilter = (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    const allowedMimeTypes = [
        // Imágenes
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "image/gif",
        "image/svg+xml",
        "image/bmp",
        "image/tiff",
        
        // Videos
        "video/mp4",
        "video/mpeg",
        "video/webm",
        "video/avi",
        "video/mov",
        "video/wmv",
        "video/flv",
        
        // Documentos PDF
        "application/pdf",
        
        // Documentos Microsoft Office
        "application/msword", // .doc
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
        "application/vnd.ms-excel", // .xls
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
        "application/vnd.ms-powerpoint", // .ppt
        "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
        
        // Documentos OpenOffice/LibreOffice
        "application/vnd.oasis.opendocument.text", // .odt
        "application/vnd.oasis.opendocument.spreadsheet", // .ods
        "application/vnd.oasis.opendocument.presentation", // .odp
        
        // Archivos de texto
        "text/plain",
        "text/csv",
        "text/rtf",
        
        // Archivos comprimidos
        "application/zip",
        "application/x-rar-compressed",
        "application/x-7z-compressed",
        
        // Otros formatos comunes
        "application/json",
        "application/xml",
        "text/xml",
        "application/rtf"
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}. Tipos permitidos: imágenes, videos, PDF, documentos de Office, archivos de texto y comprimidos.`));
    }
};

export const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB límite (aumentado para documentos)
    }
});


