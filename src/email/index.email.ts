import { GLOBAL_ENV } from "@/utils/constants";
import { ResponseError } from "@/utils/errors";

import path from "path";
import fs from "fs";
import dayjs from "dayjs";
import nodemailer from "nodemailer";
import archiver from "archiver";

const transporter = nodemailer.createTransport({
    host: "smtp.mailgun.org",
    port: GLOBAL_ENV.MAILGUN_PORT,
    secure: false,
    auth: {
        user: GLOBAL_ENV.MAILGUN_USER,
        pass: GLOBAL_ENV.MAILGUN_PASS,
    },
} as nodemailer.TransportOptions);

const YEAR = dayjs().year();

// Función auxiliar para reemplazar variables en plantillas
const replaceVariables = (html: string, variables: Record<string, string>): string => {
    let result = html;
    Object.keys(variables).forEach(key => {
        const value = variables[key] || '';
        result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
    });
    return result;
};

// Función auxiliar para enviar email
const sendEmail = async (to: string, subject: string, html: string, attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>) => {
    try {
        const mail_options: any = {
            from: `"Admin Transporte" <${GLOBAL_ENV.MAILGUN_USER}>`,
            to,
            subject,
            html,
        };
        if (attachments && attachments.length > 0) {
            // Convertir attachments al formato que nodemailer espera
            mail_options.attachments = attachments.map(att => ({
                filename: att.filename,
                content: att.content,
                contentType: att.contentType || undefined
            }));
            console.log(`Preparando ${attachments.length} adjunto(s) para el email`);
        }
        const info = await transporter.sendMail(mail_options);
        console.log(`Email enviado exitosamente a ${to}. MessageId: ${info.messageId || 'N/A'}`);
        return info;
    } catch (error) {
        console.error("Error al enviar email:", error);
        throw error; // Lanzar el error para que se maneje en la función que llama
    }
};

// 1. Cliente - Registro con credenciales
export const send_client_registration_credentials = async ({
    name,
    email,
    password
}: {
    name: string;
    email: string;
    password: string;
}) => {
    try {
        const templatePath = path.join(__dirname, "templates", "cliente-registro-credenciales.html");
        const html_template = fs.readFileSync(templatePath, "utf8");

        const html_final = replaceVariables(html_template, {
            name,
            email,
            password,
            year: YEAR.toString()
        });

        await sendEmail(email, "Bienvenido a Admin Transporte - Credenciales de Acceso", html_final);
    } catch (error) {
        if (error instanceof ResponseError) throw error;
        console.log("Error al enviar email de registro de cliente:", error);
    }
};

// 2. Cliente - Nueva contraseña
export const send_client_new_password = async ({
    name,
    email,
    password
}: {
    name: string;
    email: string;
    password: string;
}) => {
    try {
        const templatePath = path.join(__dirname, "templates", "cliente-nueva-contrasena.html");
        const html_template = fs.readFileSync(templatePath, "utf8");

        const html_final = replaceVariables(html_template, {
            name,
            password,
            year: YEAR.toString()
        });

        await sendEmail(email, "Nueva Contraseña - Admin Transporte", html_final);
    } catch (error) {
        if (error instanceof ResponseError) throw error;
        console.log("Error al enviar email de nueva contraseña:", error);
    }
};

// 3. Coordinador - Nueva solicitud pendiente
export const send_coordinator_new_solicitud = async ({
    coordinator_name,
    coordinator_email,
    client_name,
    fecha,
    hora_inicio,
    origen,
    destino,
    n_pasajeros
}: {
    coordinator_name: string;
    coordinator_email: string;
    client_name: string;
    fecha: string;
    hora_inicio: string;
    origen: string;
    destino: string;
    n_pasajeros: number;
}) => {
    try {
        const templatePath = path.join(__dirname, "templates", "coordinador-nueva-solicitud.html");
        const html_template = fs.readFileSync(templatePath, "utf8");

        const html_final = replaceVariables(html_template, {
            coordinator_name,
            client_name,
            fecha,
            hora_inicio,
            origen,
            destino,
            n_pasajeros: n_pasajeros.toString(),
            year: YEAR.toString()
        });

        await sendEmail(coordinator_email, "Nueva Solicitud Pendiente - Admin Transporte", html_final);
    } catch (error) {
        if (error instanceof ResponseError) throw error;
        console.log("Error al enviar email de nueva solicitud al coordinador:", error);
    }
};

// 4. Cliente - Solicitud aprobada
export const send_client_solicitud_approved = async ({
    client_name,
    client_email,
    fecha,
    hora_inicio,
    origen,
    destino,
    vehiculo_placa,
    conductor_name
}: {
    client_name: string;
    client_email: string;
    fecha: string;
    hora_inicio: string;
    origen: string;
    destino: string;
    vehiculo_placa: string;
    conductor_name: string;
}) => {
    try {
        const templatePath = path.join(__dirname, "templates", "cliente-solicitud-aprobada.html");
        const html_template = fs.readFileSync(templatePath, "utf8");

        const html_final = replaceVariables(html_template, {
            client_name,
            fecha,
            hora_inicio,
            origen,
            destino,
            vehiculo_placa,
            conductor_name,
            year: YEAR.toString()
        });

        await sendEmail(client_email, "Solicitud Aprobada - Admin Transporte", html_final);
    } catch (error) {
        if (error instanceof ResponseError) throw error;
        console.log("Error al enviar email de solicitud aprobada:", error);
    }
};

// 5. Vehículo - Creado y asignado
export const send_vehicle_created_assigned = async ({
    owner_name,
    owner_email,
    placa,
    vehicle_name,
    type,
    flota,
    driver_name
}: {
    owner_name: string;
    owner_email: string;
    placa: string;
    vehicle_name: string;
    type: string;
    flota: string;
    driver_name: string;
}) => {
    try {
        const templatePath = path.join(__dirname, "templates", "vehiculo-creado-asignado.html");
        const html_template = fs.readFileSync(templatePath, "utf8");

        const html_final = replaceVariables(html_template, {
            owner_name,
            placa,
            vehicle_name,
            type,
            flota,
            driver_name,
            year: YEAR.toString()
        });

        await sendEmail(owner_email, "Vehículo Creado y Asignado - Admin Transporte", html_final);
    } catch (error) {
        if (error instanceof ResponseError) throw error;
        console.log("Error al enviar email de vehículo creado:", error);
    }
};

// 6. Reporte Preoperacional
export const send_preoperational_report = async ({
    company_name,
    company_email,
    placa,
    driver_name,
    report_status,
    status_class,
    report_status_text,
    alert_message
}: {
    company_name: string;
    company_email: string;
    placa: string;
    driver_name: string;
    report_status: string;
    status_class: string;
    report_status_text: string;
    alert_message?: string;
}) => {
    try {
        const templatePath = path.join(__dirname, "templates", "reporte-preoperacional.html");
        const html_template = fs.readFileSync(templatePath, "utf8");

        const alert_html = alert_message 
            ? `<div class="alert"><strong>¡Atención!</strong> ${alert_message}</div>`
            : '';

        const html_final = replaceVariables(html_template, {
            company_name,
            placa,
            driver_name,
            report_status,
            status_class,
            report_status_text,
            alert_message: alert_html,
            year: YEAR.toString()
        });

        await sendEmail(company_email, "Nuevo Reporte Preoperacional - Admin Transporte", html_final);
    } catch (error) {
        if (error instanceof ResponseError) throw error;
        console.log("Error al enviar email de reporte preoperacional:", error);
    }
};

// 7. Gastos Operacionales
export const send_operational_bills = async ({
    company_name,
    company_email,
    placa,
    bills_count,
    bills_types,
    total_value,
    special_alert
}: {
    company_name: string;
    company_email: string;
    placa: string;
    bills_count: number;
    bills_types: string;
    total_value: number;
    special_alert?: string;
}) => {
    try {
        const templatePath = path.join(__dirname, "templates", "gastos-operacionales.html");
        const html_template = fs.readFileSync(templatePath, "utf8");

        const alert_html = special_alert
            ? `<div class="alert"><strong>Nota Importante:</strong> ${special_alert}</div>`
            : '';

        const html_final = replaceVariables(html_template, {
            company_name,
            placa,
            bills_count: bills_count.toString(),
            bills_types,
            total_value: total_value.toLocaleString('es-CO', { style: 'currency', currency: 'COP' }),
            special_alert: alert_html,
            year: YEAR.toString()
        });

        await sendEmail(company_email, "Nuevos Gastos Operacionales - Admin Transporte", html_final);
    } catch (error) {
        if (error instanceof ResponseError) throw error;
        console.log("Error al enviar email de gastos operacionales:", error);
    }
};

// 8. Usuario - Credenciales de acceso
export const send_user_credentials = async ({
    full_name,
    email,
    password,
    role
}: {
    full_name: string;
    email: string;
    password: string;
    role: string;
}) => {
    try {
        const templatePath = path.join(__dirname, "templates", "usuario-credenciales.html");
        const html_template = fs.readFileSync(templatePath, "utf8");

        const html_final = replaceVariables(html_template, {
            full_name,
            email,
            password,
            role,
            year: YEAR.toString()
        });

        await sendEmail(email, "Credenciales de Acceso - Admin Transporte", html_final);
    } catch (error) {
        if (error instanceof ResponseError) throw error;
        console.log("Error al enviar email de credenciales de usuario:", error);
    }
};

// 9. Usuario - Verificación OTP (nueva cuenta)
export const send_user_verification_otp = async ({
    full_name,
    email,
    otp_code
}: {
    full_name: string;
    email: string;
    otp_code: string;
}) => {
    try {
        const templatePath = path.join(__dirname, "templates", "usuario-verificacion-otp.html");
        const html_template = fs.readFileSync(templatePath, "utf8");

        const html_final = replaceVariables(html_template, {
            full_name,
            otp_code,
            year: YEAR.toString()
        });

        await sendEmail(email, "Verificación de Cuenta - Admin Transporte", html_final);
    } catch (error) {
        if (error instanceof ResponseError) throw error;
        console.log("Error al enviar email de verificación OTP:", error);
    }
};

// 11. Cliente - Solicitud completamente rellenada con PDFs
export const send_client_solicitud_complete = async ({
    client_name,
    client_email,
    solicitud_info,
    driver_cv_pdf,
    vehicle_technical_sheets_pdf,
    solicitud_info_pdf,
    additional_attachments = []
}: {
    client_name: string;
    client_email: string;
    solicitud_info: {
        fecha: string;
        hora_inicio: string;
        origen: string;
        destino: string;
        n_pasajeros: number;
        vehiculos_table: string; // HTML de la tabla de vehículos y conductores
    };
    driver_cv_pdf: Array<{ filename: string; buffer: Buffer }>; // Todos los CVs
    vehicle_technical_sheets_pdf: Array<{ filename: string; buffer: Buffer }>;
    solicitud_info_pdf: { filename: string; buffer: Buffer };
    additional_attachments?: Array<{ filename: string; buffer: Buffer }>;
}) => {
    try {
        const templatePath = path.join(__dirname, "templates", "cliente-solicitud-completa.html");
        const html_template = fs.readFileSync(templatePath, "utf8");

        const html_final = replaceVariables(html_template, {
            client_name,
            fecha: solicitud_info.fecha,
            hora_inicio: solicitud_info.hora_inicio,
            origen: solicitud_info.origen,
            destino: solicitud_info.destino,
            n_pasajeros: solicitud_info.n_pasajeros.toString(),
            vehiculos_table: solicitud_info.vehiculos_table,
            year: YEAR.toString()
        });

        // Validar que haya documentos para comprimir
        const totalDocuments = driver_cv_pdf.length + vehicle_technical_sheets_pdf.length + additional_attachments.length + 1; // +1 para solicitud_info_pdf
        if (totalDocuments === 0) {
            throw new ResponseError(400, "No hay documentos para enviar");
        }

        // Comprimir todos los documentos en un ZIP
        const zipBuffer = await new Promise<Buffer>((resolve, reject) => {
            const archive = archiver('zip', {
                zlib: { level: 9 } // Máxima compresión
            });

            const chunks: Buffer[] = [];
            let hasError = false;

            archive.on('data', (chunk: Buffer) => {
                chunks.push(chunk);
            });

            archive.on('end', () => {
                if (!hasError) {
                    const finalBuffer = Buffer.concat(chunks);
                    if (finalBuffer.length === 0) {
                        reject(new Error("El archivo ZIP está vacío"));
                    } else {
                        resolve(finalBuffer);
                    }
                }
            });

            archive.on('error', (err) => {
                hasError = true;
                reject(err);
            });

            archive.on('warning', (err) => {
                if (err.code === 'ENOENT') {
                    console.warn("Advertencia al crear ZIP:", err);
                } else {
                    reject(err);
                }
            });

            try {
                let filesAdded = 0;

                // Agregar todos los CVs de conductores
                driver_cv_pdf.forEach(cv => {
                    if (cv.buffer && cv.buffer.length > 0) {
                        archive.append(cv.buffer, { name: cv.filename });
                        filesAdded++;
                        console.log(`Agregando al ZIP: ${cv.filename} (${cv.buffer.length} bytes)`);
                    }
                });

                // Agregar PDF de información de solicitud
                if (solicitud_info_pdf.buffer && solicitud_info_pdf.buffer.length > 0) {
                    archive.append(solicitud_info_pdf.buffer, { name: solicitud_info_pdf.filename });
                    filesAdded++;
                    console.log(`Agregando al ZIP: ${solicitud_info_pdf.filename} (${solicitud_info_pdf.buffer.length} bytes)`);
                }

                // Agregar fichas técnicas de vehículos
                vehicle_technical_sheets_pdf.forEach(v => {
                    if (v.buffer && v.buffer.length > 0) {
                        archive.append(v.buffer, { name: v.filename });
                        filesAdded++;
                        console.log(`Agregando al ZIP: ${v.filename} (${v.buffer.length} bytes)`);
                    }
                });

                // Agregar documentos adicionales (SOATs, licencias, etc.)
                additional_attachments.forEach(att => {
                    if (att.buffer && att.buffer.length > 0) {
                        archive.append(att.buffer, { name: att.filename });
                        filesAdded++;
                        console.log(`Agregando al ZIP: ${att.filename} (${att.buffer.length} bytes)`);
                    }
                });

                console.log(`Total de archivos agregados al ZIP: ${filesAdded}`);
                
                if (filesAdded === 0) {
                    reject(new Error("No se agregaron archivos al ZIP"));
                    return;
                }

                archive.finalize();
            } catch (err) {
                hasError = true;
                reject(err);
            }
        });

        // Validar que el ZIP se haya generado correctamente
        if (!zipBuffer || zipBuffer.length === 0) {
            throw new ResponseError(500, "Error al generar el archivo ZIP: el archivo está vacío");
        }

        console.log(`ZIP generado exitosamente: ${zipBuffer.length} bytes (${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB)`);

        // Preparar adjuntos (solo el ZIP)
        // Nodemailer acepta: { filename, content: Buffer } o { filename, raw: Buffer }
        const attachments: Array<{ filename: string; content: Buffer }> = [
            {
                filename: "documentos_solicitud.zip",
                content: zipBuffer
            }
        ];

        console.log(`Enviando email a ${client_email} con ZIP adjunto...`);
        await sendEmail(client_email, "Información Completa de Servicio - Admin Transporte", html_final, attachments);
        console.log(`Email enviado exitosamente a ${client_email}`);
    } catch (error) {
        if (error instanceof ResponseError) throw error;
        console.error("Error al enviar email de solicitud completa al cliente:", error);
        throw new ResponseError(500, `Error al enviar email al cliente: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
};

// 12. Conductor - Solicitud completamente rellenada con manifiesto
export const send_driver_solicitud_complete = async ({
    driver_name,
    driver_email,
    solicitud_info,
    passenger_manifest_pdf
}: {
    driver_name: string;
    driver_email: string;
    solicitud_info: {
        fecha: string;
        hora_inicio: string;
        origen: string;
        destino: string;
        n_pasajeros: number;
        cliente_name: string;
        contacto: string;
        contacto_phone?: string;
    };
    passenger_manifest_pdf: { filename: string; buffer: Buffer };
}) => {
    try {
        const templatePath = path.join(__dirname, "templates", "conductor-solicitud-completa.html");
        const html_template = fs.readFileSync(templatePath, "utf8");

        const html_final = replaceVariables(html_template, {
            driver_name,
            fecha: solicitud_info.fecha,
            hora_inicio: solicitud_info.hora_inicio,
            origen: solicitud_info.origen,
            destino: solicitud_info.destino,
            n_pasajeros: solicitud_info.n_pasajeros.toString(),
            cliente_name: solicitud_info.cliente_name,
            contacto: solicitud_info.contacto,
            contacto_phone: solicitud_info.contacto_phone || "N/A",
            year: YEAR.toString()
        });

        const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [
            {
                filename: passenger_manifest_pdf.filename,
                content: passenger_manifest_pdf.buffer,
                contentType: "application/pdf"
            }
        ];

        await sendEmail(driver_email, "Información de Servicio Asignado - Admin Transporte", html_final, attachments);
    } catch (error) {
        if (error instanceof ResponseError) throw error;
        console.log("Error al enviar email de solicitud completa al conductor:", error);
    }
};

// 10. Usuario - Cambio de contraseña OTP
export const send_user_password_reset_otp = async ({
    full_name,
    email,
    otp_code
}: {
    full_name: string;
    email: string;
    otp_code: string;
}) => {
    try {
        const templatePath = path.join(__dirname, "templates", "usuario-cambio-contrasena-otp.html");
        const html_template = fs.readFileSync(templatePath, "utf8");

        const html_final = replaceVariables(html_template, {
            full_name,
            otp_code,
            year: YEAR.toString()
        });

        await sendEmail(email, "Recuperación de Contraseña - Admin Transporte", html_final);
    } catch (error) {
        if (error instanceof ResponseError) throw error;
        console.log("Error al enviar email de recuperación de contraseña:", error);
    }
};

// 13. Cliente - Prefactura con PDF
export const send_client_prefactura = async ({
    client_name,
    client_email,
    company_name,
    prefactura_numero,
    he,
    prefactura_pdf,
    notas,
    dashboard_link
}: {
    client_name: string;
    client_email: string;
    company_name: string;
    prefactura_numero: string;
    he: string;
    prefactura_pdf: { filename: string; buffer: Buffer };
    notas?: string;
    dashboard_link?: string;
}) => {
    try {
        const templatePath = path.join(__dirname, "templates", "cliente-prefactura.html");
        const html_template = fs.readFileSync(templatePath, "utf8");

        const notasSection = notas 
            ? `<p><strong>Notas:</strong> ${notas}</p>`
            : '';

        // Si no se proporciona dashboard_link, usar un link genérico (el frontend debería configurar esto)
        const dashboardUrl = dashboard_link || `${process.env.FRONTEND_URL || 'https://dashboard.example.com'}/prefacturas/${he}`;

        const html_final = replaceVariables(html_template, {
            client_name,
            company_name,
            prefactura_numero,
            he,
            notas_section: notasSection,
            dashboard_link: dashboardUrl,
            year: YEAR.toString()
        });

        // Preparar adjunto PDF
        const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [
            {
                filename: prefactura_pdf.filename,
                content: prefactura_pdf.buffer,
                contentType: "application/pdf"
            }
        ];

        await sendEmail(
            client_email, 
            `Prefactura N° ${prefactura_numero} - Servicio ${he} - Admin Transporte`, 
            html_final, 
            attachments
        );
    } catch (error) {
        if (error instanceof ResponseError) throw error;
        console.log("Error al enviar email de prefactura al cliente:", error);
    }
};
