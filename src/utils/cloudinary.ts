import {v2 as cloudinary, UploadApiResponse, UploadApiOptions} from "cloudinary";
import { GLOBAL_ENV } from "./constants";
import { ResponseError } from "./errors";

cloudinary.config({
    cloud_name: GLOBAL_ENV.CLOUD_NAME,
    api_key: GLOBAL_ENV.API_KEY_CLOUDINARY,
    api_secret: GLOBAL_ENV.API_SECRET_CLOUDINARY,
});

/**
 * Determina el tipo de recurso y las opciones de subida según el mimetype
 */
const getUploadOptions = (mimetype: string): UploadApiOptions => {
    const options: UploadApiOptions = {};

    // Detectar si es imagen
    if (mimetype.startsWith('image/')) {
        options.resource_type = 'image';
        // Optimizar imágenes y forzar formato WEBP
        options.quality = 'auto';
        options.format = 'webp';
    }
    // Detectar si es video
    else if (mimetype.startsWith('video/')) {
        options.resource_type = 'video';
        // Opciones específicas para videos
        options.quality = 'auto';
    }
    // Detectar documentos y otros archivos
    else if (
        mimetype === 'application/pdf' ||
        mimetype === 'application/msword' ||
        mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || // .docx
        mimetype === 'application/vnd.ms-excel' ||
        mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || // .xlsx
        mimetype === 'application/vnd.ms-powerpoint' ||
        mimetype === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' || // .pptx
        mimetype === 'text/plain' ||
        mimetype === 'application/zip' ||
        mimetype === 'application/x-zip-compressed' ||
        mimetype.startsWith('application/')
    ) {
        // Para documentos y archivos binarios usar 'raw'
        options.resource_type = 'raw';
        // Cloudinary almacenará el archivo tal cual sin procesamiento
    }
    // Detectar audio
    else if (mimetype.startsWith('audio/')) {
        options.resource_type = 'video'; // Cloudinary usa 'video' para audio también
    }
    // Tipo automático para otros casos
    else {
        options.resource_type = 'auto';
    }

    return options;
};

export const upload_media = async ({file}: {file: Express.Multer.File}): Promise<UploadApiResponse> => {
    try {
        const {buffer, mimetype, originalname} = file;

        const base64_image = buffer.toString("base64");
        const base64_image_url = `data:${mimetype};base64,${base64_image}`;

        // Obtener las opciones de subida según el tipo de archivo
        const uploadOptions = getUploadOptions(mimetype);

        // Generar un public_id único que preserve el nombre original y extensión
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(2, 15);
        const fileExtension = originalname.split('.').pop() || '';
        const fileNameWithoutExt = originalname.replace(/\.[^/.]+$/, "");
        const sanitizedFileName = fileNameWithoutExt.replace(/[^a-zA-Z0-9_-]/g, '_');
        
        // Crear public_id único con nombre original y extensión
        const publicId = `admintransporte_files/${sanitizedFileName}_${timestamp}_${randomString}.${fileExtension}`;
        
        // Agregar el public_id a las opciones
        uploadOptions.public_id = publicId;

        const result = await cloudinary.uploader.upload(base64_image_url, uploadOptions);

        return result;

    } catch (error) {
        if (error instanceof ResponseError) throw error;
        throw new ResponseError(500, "Error al subir el archivo");
    }
}

export const delete_media = async (public_ids: string[]) => {
    try {
        const result = await cloudinary.api.delete_resources(public_ids);
        return result;
    } catch (error) {
        if (error instanceof ResponseError) throw error;
        throw new ResponseError(500, "Error al eliminar los archivos");
    }
}