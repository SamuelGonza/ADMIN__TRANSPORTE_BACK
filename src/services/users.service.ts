import driver_documentsModel from '@/models/driver_documents.model';

import { User, UserRoles } from "@/contracts/interfaces/user.interface";
import userModel from "@/models/user.model";
import { ResponseError } from "@/utils/errors";
import { compare_password, generate_numbers, generate_password, generate_token_session, hash_password } from "@/utils/generate";
import { delete_media, upload_media } from '@/utils/cloudinary';
import { DEFAULT_PROFILE } from '@/utils/constants';
import { send_user_credentials, send_user_verification_otp, send_user_password_reset_otp } from '@/email/index.email';
import fs from "fs";
import path from "path";
import dayjs from "dayjs";
import companyModel from "@/models/company.model";
import { renderHtmlToPdfBuffer } from "@/utils/pdf";

export class UserService {
    private static _companyService: import("./company.service").CompanyService | null = null;

    private static get CompanyService(): import("./company.service").CompanyService {
        if (!this._companyService) {
            const { CompanyService } = require("./company.service");
            this._companyService = new CompanyService();
        }
        return this._companyService!;
    }


    //* #========== POST METHODS ==========#
    public async create_new_user({ payload, company_id, skip_company_validation = false, is_new_company = false }: { payload: User, company_id: string, skip_company_validation?: boolean, is_new_company: boolean }) {
        try {
            const {
                full_name,
                document,
                role,
                contact,
                email,
                password
            } = payload;

            await this.verify_exist_user({ document, email })
            if (skip_company_validation === false) await UserService.CompanyService.verify_exist_company_by_id(company_id)

            const plane_random_password = is_new_company ? password : generate_password()
            const hashed_password = hash_password(plane_random_password)

            const generated_otp = generate_numbers(6)

            const new_user = await userModel.create({
                role: is_new_company ? "admin" : role,
                is_active: is_new_company ? false : true,
                password: hashed_password,
                otp_recovery: generated_otp,
                created: new Date(),
                full_name,
                document,
                contact,
                email,
                company_id,
            })


            await new_user.save()

            if (role === "conductor") {
                const new_driver_documents = await driver_documentsModel.create({
                    driver_id: new_user._id,
                    document: {
                        url: "",
                        public_id: "",
                        type: "",
                    },
                    licencia_conduccion: {
                        url: "",
                        public_id: "",
                        type: "",
                    },
                })
                await new_driver_documents.save()
            }

            // Enviar credenciales via email
            if (is_new_company) {
                // Enviar email de solicitud de verificacion de cuenta con el codigo otp
                await send_user_verification_otp({
                    full_name,
                    email,
                    otp_code: generated_otp.toString()
                });
            } else {
                // Enviar credenciales de inicio de sesion
                await send_user_credentials({
                    full_name,
                    email,
                    password: plane_random_password,
                    role
                });
            }
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo registrar el nuevo ususario")
        }
    }

    public async verify_new_account_otp({ email, otp_recovery }: { email: string, otp_recovery: number }) {
        try {
            const exist_user = await userModel.findOne({ email, otp_recovery });
            if (!exist_user) throw new ResponseError(404, "No se encontro el ususario")

            if (otp_recovery != exist_user.otp_recovery) throw new ResponseError(401, "Codigo invalido")

            exist_user.is_active = true;
            exist_user.otp_recovery = generate_numbers(6)
            
            // Generar nueva contraseña temporal para el usuario verificado
            const new_password = generate_password();
            const hashed_new_password = await hash_password(new_password);
            exist_user.password = hashed_new_password;
            
            await exist_user.save()

            // Enviar credenciales de inicio de sesion
            await send_user_credentials({
                full_name: exist_user.full_name,
                email: exist_user.email,
                password: new_password,
                role: exist_user.role
            });
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo verificar la cuenta")
        }
    }

    public async upload_driver_documents({
        document,
        licencia_conduccion,
        driver_id,
        licencia_conduccion_categoria,
        licencia_conduccion_vencimiento,
        seguridad_social_vencimiento
    }: {
        document: { back: Express.Multer.File, front: Express.Multer.File },
        licencia_conduccion: { back: Express.Multer.File, front: Express.Multer.File },
        driver_id: string,
        licencia_conduccion_categoria?: string,
        licencia_conduccion_vencimiento?: Date,
        seguridad_social_vencimiento?: Date
    }) {
        try {
            const find_driver_documents = await driver_documentsModel.findOne({ driver_id });
            if (!find_driver_documents) throw new ResponseError(404, "No pudimos obtener los documentos")

            const [
                uploaded_document_front,
                uploaded_document_back,
                uploaded_license_front,
                uploaded_license_back
            ] = await Promise.all([
                upload_media({ file: document.front }),
                upload_media({ file: document.back }),
                upload_media({ file: licencia_conduccion.front }),
                upload_media({ file: licencia_conduccion.back })
            ])

            find_driver_documents.document = {
                front: {
                    url: uploaded_document_front.secure_url,
                    public_id: uploaded_document_front.public_id,
                    type: "img",
                    original_name: `cedula_frontal_${Date.now()}`
                },
                back: {
                    url: uploaded_document_back.secure_url,
                    public_id: uploaded_document_back.public_id,
                    type: "img",
                    original_name: `cedula_trasera_${Date.now()}`
                },
            }

            find_driver_documents.licencia_conduccion = {
                front: {
                    url: uploaded_license_front.secure_url,
                    public_id: uploaded_license_front.public_id,
                    type: "img",
                    original_name: `licencia_frontal_${Date.now()}`
                },
                back: {
                    url: uploaded_license_back.secure_url,
                    public_id: uploaded_license_back.public_id,
                    type: "img",
                    original_name: `licencia_trasera_${Date.now()}`
                },
            }

            // Metadatos legales
            if (licencia_conduccion_categoria) (find_driver_documents as any).licencia_conduccion_categoria = licencia_conduccion_categoria;
            if (licencia_conduccion_vencimiento) (find_driver_documents as any).licencia_conduccion_vencimiento = licencia_conduccion_vencimiento;
            if (seguridad_social_vencimiento) (find_driver_documents as any).seguridad_social_vencimiento = seguridad_social_vencimiento;

            await find_driver_documents.save()

        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudieron subir los archivos")
        }
    }

    public async reset_password({ email }: { email: string }) {
        try {
            const find_user = await userModel.findOne({ email }).select("otp_recovery email full_name");
            if (!find_user) throw new ResponseError(404, "Cuenta no encontrada")
            if (find_user.is_delete) throw new ResponseError(404, "Cuenta no disponible")

            // Generar nuevo OTP para recuperación
            const new_otp = generate_numbers(6);
            find_user.otp_recovery = new_otp;
            await find_user.save();

            // Enviar email de cambio de contraseña con el codigo otp
            await send_user_password_reset_otp({
                full_name: find_user.full_name,
                email: find_user.email,
                otp_code: new_otp.toString()
            });
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo iniciar la recuperacion")
        }
    }

    public async verify_otp_password_reset({ email, otp_recovery }: { email: string, otp_recovery: number }) {
        try {
            const find_user = await userModel.findOne({ email }).select("otp_recovery email");
            if (!find_user) throw new ResponseError(404, "Cuenta no encontrada")
            if (find_user.is_delete) throw new ResponseError(401, "Cuenta no disponible")

            if (otp_recovery != find_user.otp_recovery) throw new ResponseError(401, "Codigo invalido")

            find_user.otp_recovery = generate_numbers(6)
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se confirmar el codigo")
        }
    }

    public async update_new_password({ email, new_password }: { email: string, new_password: string }) {
        try {
            const find_user = await userModel.findOne({ email }).select("password");
            if (!find_user) throw new ResponseError(404, "Cuenta no encontrada")
            if (find_user.is_delete) throw new ResponseError(401, "Cuenta no disponible")


            const new_hashed_password = await hash_password(new_password)
            find_user.password = new_hashed_password
            await find_user.save()
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo actualizar la nueva contraseña")
        }
    }

    public async login({ email, password }: { email: string, password: string }) {
        try {
            const find_user = await userModel
                .findOne({ email })
                .select("full_name avatar role company_id password is_active is_delete")
                .populate('company_id', 'company_name logo');

            if (!find_user) throw new ResponseError(404, "Cuenta no encontrada")
            if (!find_user.is_active) throw new ResponseError(401, "Tu cuenta no esta activa. Contacta con un administrador")
            if (find_user.is_delete) throw new ResponseError(401, "Cuenta no disponible")

            const ok_password = await compare_password(password, find_user.password)

            if (!ok_password) throw new ResponseError(401, "Contraseña incorrecta")

            const token = generate_token_session({ id: find_user._id.toString(), role: find_user.role, company_id: find_user.company_id.toString() })

            return {
                token,
                user: {
                    full_name: find_user.full_name,
                    avatar: find_user.avatar.url,
                    role: find_user.role,
                    company_id: (find_user.company_id as any)._id,
                    company_name: (find_user.company_id as any).company_name,
                    company_logo: (find_user.company_id as any).logo
                }
            }
        } catch (error) {
            console.log(error);
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo autenticar el ususario")
        }
    }


    //* #========== GET METHODS ==========#
    public async get_all_users({ filters, page = 1, limit = 10 }: {
        filters: {
            name?: string,
            document?: number,
            email?: string,
            company_id?: string,
            role?: UserRoles
        },
        page?: number,
        limit?: number
    }) {
        try {
            // Construir el objeto de consulta dinámicamente
            const query: any = {};

            // Filtro por nombre (búsqueda parcial, case-insensitive)
            if (filters.name) {
                query.full_name = { $regex: filters.name, $options: 'i' };
            }

            // Filtro por número de documento
            if (filters.document) {
                query['document.number'] = filters.document;
            }

            // Filtro por email (búsqueda exacta)
            if (filters.email) {
                query.email = filters.email;
            }

            // Filtro por company_id
            if (filters.company_id) {
                query.company_id = filters.company_id;
            }

            // Filtro por role
            if (filters.role) {
                query.role = filters.role;
            }

            // Calcular skip para paginación
            const skip = (page - 1) * limit;

            // Ejecutar consulta con paginación
            const [users, total] = await Promise.all([
                userModel
                    .find(query)
                    .select('-password -otp_recovery') // Excluir campos sensibles
                    .skip(skip)
                    .limit(limit)
                    .sort({ created: -1 }) // Ordenar por fecha de creación (más recientes primero)
                    .lean(),
                userModel.countDocuments(query) // Contar total de documentos que coinciden
            ]);

            return {
                users,
                pagination: {
                    current_page: page,
                    total_pages: Math.ceil(total / limit),
                    total_users: total,
                    limit,
                    has_next_page: page < Math.ceil(total / limit),
                    has_prev_page: page > 1
                }
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudieron obtener los usuarios");
        }
    }

    public async get_all_users_company({ filters, page = 1, limit = 10, company_id }: {
        filters: {
            name?: string,
            document?: number,
            email?: string,
            role?: UserRoles
        },
        page?: number,
        limit?: number,
        company_id: string
    }) {
        try {
            if (!company_id) throw new ResponseError(400, "Se requiere una empresa")
            // Construir el objeto de consulta dinámicamente
            const query: any = {};

            // Filtro por nombre (búsqueda parcial, case-insensitive)
            if (filters.name) {
                query.full_name = { $regex: filters.name, $options: 'i' };
            }

            // Filtro por número de documento
            if (filters.document) {
                query['document.number'] = filters.document;
            }

            // Filtro por email (búsqueda exacta)
            if (filters.email) {
                query.email = filters.email;
            }

            // Filtro por company_id
            if (company_id) {
                query.company_id = company_id;
            }

            // Filtro por role
            if (filters.role) {
                query.role = filters.role;
            }

            // Calcular skip para paginación
            const skip = (page - 1) * limit;

            // Ejecutar consulta con paginación
            const [users, total] = await Promise.all([
                userModel
                    .find(query)
                    .select('-password -otp_recovery') // Excluir campos sensibles
                    .skip(skip)
                    .limit(limit)
                    .sort({ created: -1 }) // Ordenar por fecha de creación (más recientes primero)
                    .lean(),
                userModel.countDocuments(query) // Contar total de documentos que coinciden
            ]);

            return {
                users,
                pagination: {
                    current_page: page,
                    total_pages: Math.ceil(total / limit),
                    total_users: total,
                    limit,
                    has_next_page: page < Math.ceil(total / limit),
                    has_prev_page: page > 1
                }
            };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudieron obtener los usuarios");
        }
    }

    public async get_user_by_id({ id }: { id: string }) {
        try {
            const find_user = await userModel.findById(id).select("-otp_recovery -password")
            if (!find_user) throw new ResponseError(404, "Cuenta no encontrada")

            return find_user.toObject()
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudieron obtener el ususario");
        }
    }


    //* #========== PUT METHODS ==========#
    public async update_user_info({ full_name, contact, id }: { full_name: string, contact: { email: string; phone: string; address: string; }, id: string }) {
        try {
            const find_user = await userModel.findById(id);
            if (!find_user) throw new ResponseError(404, "Cuenta no encontrada")
            if (find_user.is_delete) throw new ResponseError(401, "Cuenta no disponible")

            find_user.full_name = full_name;
            find_user.contact = contact;
            await find_user.save()

        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo actualiar la informacion del ususario");
        }
    }

    public async update_user_avatar({ new_avatar, id }: { new_avatar: Express.Multer.File, id: string }) {
        try {
            const find_user = await userModel.findById(id);
            if (!find_user) throw new ResponseError(404, "Cuenta no encontrada")
            if (find_user.is_delete) throw new ResponseError(401, "Cuenta no disponible")

            if (!new_avatar) throw new ResponseError(400, "Se requiere una imagen")

            if (find_user.avatar.public_id) {
                await delete_media([find_user.avatar.public_id])
            }

            const result_upload = await upload_media({ file: new_avatar })

            find_user.avatar = {
                url: result_upload.secure_url,
                public_id: result_upload.public_id,
                type: "img"
            }

            await find_user.save()

        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo actualiar la informacion del ususario");
        }
    }

    public async update_driver_documents({
        document,
        licencia_conduccion,
        driver_id,
        licencia_conduccion_categoria,
        licencia_conduccion_vencimiento,
        seguridad_social_vencimiento
    }: {
        document: { back: Express.Multer.File, front: Express.Multer.File },
        licencia_conduccion: { back: Express.Multer.File, front: Express.Multer.File },
        driver_id: string,
        licencia_conduccion_categoria?: string,
        licencia_conduccion_vencimiento?: Date,
        seguridad_social_vencimiento?: Date
    }) {
        try {
            const find_driver_documents = await driver_documentsModel.findOne({ driver_id });
            if (!find_driver_documents) throw new ResponseError(404, "No pudimos obtener los documentos")

            let delete_files: string[] = []

            if (find_driver_documents.document.front.public_id && document.front) delete_files.push(find_driver_documents.document.front.public_id)
            if (find_driver_documents.document.back.public_id && document.back) delete_files.push(find_driver_documents.document.back.public_id)
            if (find_driver_documents.licencia_conduccion.front.public_id && document.front) delete_files.push(find_driver_documents.document.front.public_id)
            if (find_driver_documents.licencia_conduccion.back.public_id && document.back) delete_files.push(find_driver_documents.document.back.public_id)

            await delete_media(delete_files)

            const [
                uploaded_document_front,
                uploaded_document_back,
                uploaded_license_front,
                uploaded_license_back
            ] = await Promise.all([
                upload_media({ file: document.front }),
                upload_media({ file: document.back }),
                upload_media({ file: licencia_conduccion.front }),
                upload_media({ file: licencia_conduccion.back })
            ])

            find_driver_documents.document = {
                front: {
                    url: uploaded_document_front.secure_url,
                    public_id: uploaded_document_front.public_id,
                    type: "img",
                    original_name: `cedula_frontal_${Date.now()}`
                },
                back: {
                    url: uploaded_document_back.secure_url,
                    public_id: uploaded_document_back.public_id,
                    type: "img",
                    original_name: `cedula_trasera_${Date.now()}`
                },
            }

            find_driver_documents.licencia_conduccion = {
                front: {
                    url: uploaded_license_front.secure_url,
                    public_id: uploaded_license_front.public_id,
                    type: "img",
                    original_name: `licencia_frontal_${Date.now()}`
                },
                back: {
                    url: uploaded_license_back.secure_url,
                    public_id: uploaded_license_back.public_id,
                    type: "img",
                    original_name: `licencia_trasera_${Date.now()}`
                },
            }

            // Metadatos legales
            if (licencia_conduccion_categoria) (find_driver_documents as any).licencia_conduccion_categoria = licencia_conduccion_categoria;
            if (licencia_conduccion_vencimiento) (find_driver_documents as any).licencia_conduccion_vencimiento = licencia_conduccion_vencimiento;
            if (seguridad_social_vencimiento) (find_driver_documents as any).seguridad_social_vencimiento = seguridad_social_vencimiento;

            await find_driver_documents.save()

        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se actualizar los archivos")
        }
    }

    public async get_driver_documents({ driver_id }: { driver_id: string }) {
        try {
            const docs = await driver_documentsModel
                .findOne({ driver_id })
                .populate("driver_id", "full_name document contact email role")
                .lean();
            if (!docs) throw new ResponseError(404, "No pudimos obtener los documentos");
            return docs;
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudieron obtener los documentos del conductor");
        }
    }

    public async update_driver_profile({
        driver_id,
        payload
    }: {
        driver_id: string;
        payload: any;
    }) {
        try {
            const docs = await driver_documentsModel.findOne({ driver_id });
            if (!docs) throw new ResponseError(404, "No pudimos obtener los documentos");

            // Licencia
            if (payload.licencia_conduccion_numero !== undefined) (docs as any).licencia_conduccion_numero = payload.licencia_conduccion_numero;
            if (payload.licencia_conduccion_categoria !== undefined) (docs as any).licencia_conduccion_categoria = payload.licencia_conduccion_categoria;
            if (payload.licencia_conduccion_estado !== undefined) (docs as any).licencia_conduccion_estado = payload.licencia_conduccion_estado;
            if (payload.licencia_conduccion_expedicion !== undefined) (docs as any).licencia_conduccion_expedicion = payload.licencia_conduccion_expedicion;
            if (payload.licencia_conduccion_vencimiento !== undefined) (docs as any).licencia_conduccion_vencimiento = payload.licencia_conduccion_vencimiento;

            // Básico
            if (payload.lugar_expedicion_documento !== undefined) (docs as any).lugar_expedicion_documento = payload.lugar_expedicion_documento;
            if (payload.fecha_nacimiento !== undefined) (docs as any).fecha_nacimiento = payload.fecha_nacimiento;
            if (payload.lugar_nacimiento !== undefined) (docs as any).lugar_nacimiento = payload.lugar_nacimiento;
            if (payload.estado_civil !== undefined) (docs as any).estado_civil = payload.estado_civil;
            if (payload.tipo_sangre !== undefined) (docs as any).tipo_sangre = payload.tipo_sangre;
            if (payload.genero !== undefined) (docs as any).genero = payload.genero;
            if (payload.direccion !== undefined) (docs as any).direccion = payload.direccion;
            if (payload.barrio !== undefined) (docs as any).barrio = payload.barrio;
            if (payload.ciudad !== undefined) (docs as any).ciudad = payload.ciudad;
            if (payload.telefono !== undefined) (docs as any).telefono = payload.telefono;
            if (payload.telefono_celular !== undefined) (docs as any).telefono_celular = payload.telefono_celular;
            if (payload.email_personal !== undefined) (docs as any).email_personal = payload.email_personal;

            // Bancario
            if (payload.entidad_bancaria !== undefined) (docs as any).entidad_bancaria = payload.entidad_bancaria;
            if (payload.tipo_cuenta !== undefined) (docs as any).tipo_cuenta = payload.tipo_cuenta;
            if (payload.cuenta_numero !== undefined) (docs as any).cuenta_numero = payload.cuenta_numero;

            // Laboral
            if (payload.empresa_contratante !== undefined) (docs as any).empresa_contratante = payload.empresa_contratante;
            if (payload.tipo_contrato !== undefined) (docs as any).tipo_contrato = payload.tipo_contrato;
            if (payload.condicion_empresa !== undefined) (docs as any).condicion_empresa = payload.condicion_empresa;
            if (payload.fecha_vinculacion !== undefined) (docs as any).fecha_vinculacion = payload.fecha_vinculacion;
            if (payload.cargo_asignado !== undefined) (docs as any).cargo_asignado = payload.cargo_asignado;
            if (payload.lugar_trabajo !== undefined) (docs as any).lugar_trabajo = payload.lugar_trabajo;
            if (payload.proceso_asignado !== undefined) (docs as any).proceso_asignado = payload.proceso_asignado;

            // SST
            if (payload.sst !== undefined) (docs as any).sst = payload.sst;

            // IPS examen médico
            if (payload.ips_examen_medico !== undefined) (docs as any).ips_examen_medico = payload.ips_examen_medico;

            // Inducción
            if (payload.induccion !== undefined) (docs as any).induccion = payload.induccion;

            await docs.save();
            return docs.toObject();
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo actualizar el perfil del conductor");
        }
    }

    private resolveTemplatePath(fileName: string) {
        const cwd = process.cwd();
        const distPath = path.join(cwd, "dist", "email", "templates", fileName);
        const srcPath = path.join(cwd, "src", "email", "templates", fileName);
        if (fs.existsSync(distPath)) return distPath;
        return srcPath;
    }

    private replaceVariables(html: string, variables: Record<string, string>): string {
        let result = html;
        Object.keys(variables).forEach((key) => {
            const value = variables[key] || "";
            result = result.replace(new RegExp(`{{${key}}}`, "g"), value);
        });
        return result;
    }

    public async generate_driver_technical_sheet_pdf({
        driver_id
    }: {
        driver_id: string;
    }): Promise<{ filename: string; buffer: Buffer }> {
        try {
            const user = await userModel.findById(driver_id).select("full_name document contact email company_id").lean();
            if (!user) throw new ResponseError(404, "Conductor no encontrado");

            const docs = await driver_documentsModel.findOne({ driver_id }).lean();
            if (!docs) throw new ResponseError(404, "Documentos del conductor no encontrados");

            const company = user.company_id ? await companyModel.findById(String(user.company_id)).lean() : null;
            const fechaExpedicion = dayjs(new Date()).format("DD/MM/YYYY HH:mm");
            const nit = company?.document?.number
                ? `${company.document.number}${company.document.dv ? "-" + company.document.dv : ""}`
                : "";

            const fmtDate = (d: any) => (d ? dayjs(d).format("DD/MM/YYYY") : "");

            const htmlTemplate = fs.readFileSync(this.resolveTemplatePath("ficha-tecnica-conductor.html"), "utf8");
            const html = this.replaceVariables(htmlTemplate, {
                fecha_expedicion: fechaExpedicion,
                company_name: company?.company_name || "",
                company_nit: nit,
                company_logo_url: company?.logo?.url || "",

                full_name: user.full_name || "",
                doc_type: (user as any)?.document?.type ? String((user as any).document.type).toUpperCase() : "",
                doc_number: (user as any)?.document?.number ? String((user as any).document.number) : "",
                phone: (user as any)?.contact?.phone || "",
                email: (user as any)?.email || "",

                lic_numero: (docs as any).licencia_conduccion_numero || "",
                lic_categoria: (docs as any).licencia_conduccion_categoria || "",
                lic_estado: (docs as any).licencia_conduccion_estado || "",
                lic_expedicion: fmtDate((docs as any).licencia_conduccion_expedicion),
                lic_vencimiento: fmtDate((docs as any).licencia_conduccion_vencimiento),

                fecha_nacimiento: fmtDate((docs as any).fecha_nacimiento),
                lugar_nacimiento: (docs as any).lugar_nacimiento || "",
                estado_civil: (docs as any).estado_civil || "",
                tipo_sangre: (docs as any).tipo_sangre || "",
                genero: (docs as any).genero || "",
                direccion: (docs as any).direccion || "",
                ciudad: (docs as any).ciudad || "",
                email_personal: (docs as any).email_personal || "",
            });

            const pdfBuffer = await renderHtmlToPdfBuffer(html);
            const safeDoc = (user as any)?.document?.number ? String((user as any).document.number) : "conductor";
            const filename = `ficha_tecnica_conductor_${safeDoc}_${dayjs().format("YYYYMMDD_HHmm")}.pdf`;
            return { filename, buffer: pdfBuffer };
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo generar la ficha técnica del conductor");
        }
    }

    public async change_active_status({ id }: { id: string }) {
        try {
            const find_user = await userModel.findById(id);
            if (!find_user) throw new ResponseError(404, "Cuenta no encontrada")
            if (find_user.is_delete) throw new ResponseError(401, "Cuenta no disponible")

            find_user.is_active = !find_user.is_active
            await find_user.save()
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo cambiar el estado")
        }
    }


    //* #========== DELETE METHODS ==========#

    public async delete_user({ user_id }: { user_id: string }) {
        try {
            const find_user = await userModel.findById(user_id);
            if (!find_user) throw new ResponseError(404, "Cuenta no encontrada");
            if (find_user.is_delete) throw new ResponseError(401, "No se puede volver a eliminar.");

            if (find_user.avatar.public_id) await delete_media([find_user.avatar.public_id])

            find_user.full_name = `${find_user.full_name.split(" ")[0]}****`;
            find_user.document.number = find_user.document.number % 10000;
            find_user.email = `${find_user.email.slice(0, 4)}*****@${find_user.email.split("@")[1]}`;
            find_user.password = `${hash_password(generate_numbers(24).toString())}`;
            find_user.otp_recovery = 0;
            find_user.is_delete = true;
            find_user.is_active = false;
            find_user.avatar = DEFAULT_PROFILE;

            await find_user.save()

            if (find_user.role === "conductor") {
                const find_driver_documents = await driver_documentsModel.findOne({ driver_id: user_id })
                const documents_p_id: string[] = [
                    find_driver_documents?.document.front?.public_id,
                    find_driver_documents?.document.back?.public_id
                ].filter((id): id is string => !!id)
                const license_p_id: string[] = [
                    find_driver_documents?.licencia_conduccion.front?.public_id,
                    find_driver_documents?.licencia_conduccion.back?.public_id
                ].filter((id): id is string => !!id)

                await delete_media([...documents_p_id, ...license_p_id])
            }

        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo eliminar el usuari")
        }
    }

    //* #========== PUBLIC METHODS ==========#
    public async verify_exist_user({ document, email }: { document: User["document"], email: string }) {
        try {
            const find = await userModel.findOne({
                $or: [
                    { "document.number": document.number },
                    { "email": email }
                ]
            });
            if (find) throw new ResponseError(409, "Esta usuario ya existe")
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo validar la existencia del usuario")
        }
    }
    
    public async verify_exist_user_by_id({id}: {id: string}) {
        try {
            const find = await userModel.findById(id)
            if (!find) throw new ResponseError(409, "Esta usuario no existe")
        } catch (error) {
            if (error instanceof ResponseError) throw error;
            throw new ResponseError(500, "No se pudo validar la existencia del usuario")
        }
    }
}