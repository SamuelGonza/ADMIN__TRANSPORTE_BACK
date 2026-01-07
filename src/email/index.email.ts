import { GLOBAL_ENV } from "@/utils/constants";
import { ResponseError } from "@/utils/errors";

import path from "path";
import fs from "fs";
import dayjs from "dayjs";
import nodemailer from "nodemailer";

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
            mail_options.attachments = attachments;
        }
        await transporter.sendMail(mail_options);
    } catch (error) {
        console.log("Error al enviar email:", error);
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
    solicitud_info_pdf
}: {
    client_name: string;
    client_email: string;
    solicitud_info: {
        fecha: string;
        hora_inicio: string;
        origen: string;
        destino: string;
        n_pasajeros: number;
        vehiculo_placa: string;
        conductor_name: string;
    };
    driver_cv_pdf: { filename: string; buffer: Buffer };
    vehicle_technical_sheets_pdf: Array<{ filename: string; buffer: Buffer }>;
    solicitud_info_pdf: { filename: string; buffer: Buffer };
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
            vehiculo_placa: solicitud_info.vehiculo_placa,
            conductor_name: solicitud_info.conductor_name,
            year: YEAR.toString()
        });

        // Preparar adjuntos
        const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [
            {
                filename: driver_cv_pdf.filename,
                content: driver_cv_pdf.buffer,
                contentType: "application/pdf"
            },
            {
                filename: solicitud_info_pdf.filename,
                content: solicitud_info_pdf.buffer,
                contentType: "application/pdf"
            },
            ...vehicle_technical_sheets_pdf.map(v => ({
                filename: v.filename,
                content: v.buffer,
                contentType: "application/pdf"
            }))
        ];

        await sendEmail(client_email, "Información Completa de Servicio - Admin Transporte", html_final, attachments);
    } catch (error) {
        if (error instanceof ResponseError) throw error;
        console.log("Error al enviar email de solicitud completa al cliente:", error);
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
