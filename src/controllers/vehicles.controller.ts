import { Request, Response } from "express";
import { VehicleServices } from "@/services/vehicles.service";
import { ResponseError } from "@/utils/errors";
import { AuthRequest } from "@/utils/express";

export class VehiclesController {
    private vehicleServices = new VehicleServices();

    public async create_vehicle(req: Request, res: Response) {
        try {
            const { company_id, ...payload } = req.body;
            const picture = req.file;
            const user_company_id = (req as AuthRequest).user?.company_id;

            await this.vehicleServices.create_new_vehicle({ 
                payload: payload as any, 
                company_id: user_company_id || company_id, 
                picture: picture as any 
            });
            res.status(201).json({ 
                message: "Vehículo creado exitosamente"
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al crear vehículo"
            });
            return;
        }
    }

    public async create_preoperational_report(req: Request, res: Response) {
        try {
            const { vehicle_id, driver_id } = req.body;
            let { reports } = req.body;
            const user_id = (req as AuthRequest).user?._id;
            const role = (req as AuthRequest).user?.role;
            
            // If user is driver, use their ID
            const target_driver_id = (role === 'conductor' && user_id) ? user_id : driver_id;

            if (typeof reports === 'string') {
                try {
                    reports = JSON.parse(reports);
                } catch (e) {
                }
            }
            
            const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

            if (files && Array.isArray(reports)) {
                reports.forEach((report: any, index: number) => {
                    const fieldName = `reports[${index}][media]`;
                    if (files[fieldName]) {
                        report.media = files[fieldName];
                    } else {
                        report.media = [];
                    }
                });
            }

            await this.vehicleServices.create_preoperational_report({
                vehicle_id,
                driver_id: target_driver_id,
                reports: reports as any
            });
            res.status(201).json({ 
                message: "Reporte preoperacional creado exitosamente"
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al crear reporte preoperacional"
            });
            return;
        }
    }

    public async create_operational_bills(req: Request, res: Response) {
        try {
            const { vehicle_id, user_id } = req.body;
            let { bills } = req.body;
            const auth_user_id = (req as AuthRequest).user?._id;

            // Use auth user id if available/appropriate (e.g. driver or admin logging their own action)
            const target_user_id = auth_user_id || user_id;

            if (typeof bills === 'string') {
                try {
                    bills = JSON.parse(bills);
                } catch (e) {
                }
            }

            const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
            
            if (files && Array.isArray(bills)) {
                bills.forEach((bill: any, index: number) => {
                    const fieldName = `bills[${index}][media_support]`;
                    if (files[fieldName]) {
                        bill.media_support = files[fieldName];
                    } else {
                        bill.media_support = [];
                    }
                });
            }

            await this.vehicleServices.create_operational_bills({
                vehicle_id,
                user_id: target_user_id,
                bills: bills as any
            });
            res.status(201).json({ 
                message: "Gastos operacionales registrados exitosamente"
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al registrar gastos"
            });
            return;
        }
    }

    public async get_all_vehicles(req: Request, res: Response) {
        try {
            const { page, limit, placa, type, name } = req.query;
            const filters = {
                placa: placa as string,
                type: type as any,
                name: name as string
            };

            const response = await this.vehicleServices.get_all_vehicles({
                filters,
                page: page ? Number(page) : 1,
                limit: limit ? Number(limit) : 10
            });
            res.status(200).json({
                message: "Vehículos obtenidos correctamente",
                data: response
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al obtener vehículos"
            });
            return;
        }
    }

    public async get_all_vehicles_by_company(req: Request, res: Response) {
        try {
            const { page, limit, placa, type, name } = req.query;
            const c_id = req.params.company_id || req.query.company_id as string;
            const user_company_id = (req as AuthRequest).user?.company_id;

            const filters = {
                placa: placa as string,
                type: type as any,
                name: name as string
            };

            const response = await this.vehicleServices.get_all_vehicles_by_company({
                filters,
                page: page ? Number(page) : 1,
                limit: limit ? Number(limit) : 10,
                company_id: user_company_id || c_id
            });
            res.status(200).json({
                message: "Vehículos de la compañía obtenidos correctamente",
                data: response
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al obtener vehículos de la compañía"
            });
            return;
        }
    }

    public async get_vehicles_by_user(req: Request, res: Response) {
        try {
            const { user_id } = req.params; 
            const auth_user_id = (req as AuthRequest).user?._id;
            // Usually users see their own, but maybe admin sees others.
            // If params has user_id, use it. If not, try auth user.
            const target_id = user_id || auth_user_id;

            const response = await this.vehicleServices.get_vehicles_by_user({ user_id: target_id });
            res.status(200).json({
                message: "Vehículos del usuario obtenidos correctamente",
                data: response
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al obtener vehículos del usuario"
            });
            return;
        }
    }

    public async get_vehicle_by_id(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const response = await this.vehicleServices.get_vehicle_by_id({ id });
            res.status(200).json({
                message: "Vehículo obtenido correctamente",
                data: response
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al obtener vehículo"
            });
            return;
        }
    }

    public async update_vehicle(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const payload = req.body;
            await this.vehicleServices.update_vehicle({ id, payload });
            res.status(200).json({ 
                message: "Vehículo actualizado exitosamente"
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al actualizar vehículo"
            });
            return;
        }
    }

    public async update_vehicle_picture(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const picture = req.file;
            if (!picture) throw new Error("No image uploaded");

            await this.vehicleServices.update_vehicle_picture({ id, picture });
            res.status(200).json({ 
                message: "Imagen del vehículo actualizada"
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al actualizar imagen del vehículo"
            });
            return;
        }
    }

    public async update_vehicle_owner(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { owner_id } = req.body;
            await this.vehicleServices.update_vehicle_owner({ id, owner_id });
            res.status(200).json({ 
                message: "Propietario del vehículo actualizado"
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al actualizar propietario"
            });
            return;
        }
    }

    public async update_vehicle_driver(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { driver_id } = req.body;
            await this.vehicleServices.update_vehicle_driver({ id, driver_id });
            res.status(200).json({ 
                message: "Conductor del vehículo actualizado"
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al actualizar conductor"
            });
            return;
        }
    }

    public async get_vehicle_documents(req: Request, res: Response) {
        try {
            const { vehicle_id } = req.params;
            const response = await this.vehicleServices.get_vehicle_documents({ vehicle_id });
            res.status(200).json({
                message: "Documentos del vehículo obtenidos correctamente",
                data: response
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al obtener documentos del vehículo"
            });
            return;
        }
    }

    public async update_vehicle_documents(req: Request, res: Response) {
        try {
            const { vehicle_id } = req.params;
            const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

            const payload = {
                soat: files?.soat?.[0],
                tecnomecanica: files?.tecnomecanica?.[0],
                seguro: files?.seguro?.[0],
                licencia_transito: files?.licencia_transito?.[0],
                runt: files?.runt?.[0],
                soat_vencimiento: req.body.soat_vencimiento ? new Date(req.body.soat_vencimiento) : undefined,
                tecnomecanica_vencimiento: req.body.tecnomecanica_vencimiento ? new Date(req.body.tecnomecanica_vencimiento) : undefined,
                seguro_vencimiento: req.body.seguro_vencimiento ? new Date(req.body.seguro_vencimiento) : undefined,
                tarjeta_operacion_vencimiento: req.body.tarjeta_operacion_vencimiento ? new Date(req.body.tarjeta_operacion_vencimiento) : undefined,
            };

            await this.vehicleServices.update_vehicle_documents({ vehicle_id, payload });
            res.status(200).json({
                message: "Documentos del vehículo actualizados correctamente"
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al actualizar documentos del vehículo"
            });
            return;
        }
    }

    public async download_vehicle_technical_sheet_pdf(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { filename, buffer } = await this.vehicleServices.generate_vehicle_technical_sheet_pdf({
                vehicle_id: id
            });
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
            res.status(200).send(buffer);
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al generar ficha técnica del vehículo"
            });
            return;
        }
    }

    public async get_vehicle_operationals(req: Request, res: Response) {
        try {
            const { vehicle_id } = req.params;
            const { page, limit } = req.query;
            
            const response = await this.vehicleServices.get_vehicle_operationals({
                vehicle_id,
                page: page ? Number(page) : 1,
                limit: limit ? Number(limit) : 10
            });
            res.status(200).json({
                message: "Registros operacionales del vehículo obtenidos correctamente",
                data: response
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al obtener registros operacionales del vehículo"
            });
            return;
        }
    }

    public async get_vehicle_preoperationals(req: Request, res: Response) {
        try {
            const { vehicle_id } = req.params;
            const { page, limit } = req.query;
            
            const response = await this.vehicleServices.get_vehicle_preoperationals({
                vehicle_id,
                page: page ? Number(page) : 1,
                limit: limit ? Number(limit) : 10
            });
            res.status(200).json({
                message: "Reportes preoperacionales del vehículo obtenidos correctamente",
                data: response
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al obtener reportes preoperacionales del vehículo"
            });
            return;
        }
    }

    public async get_last_operational_by_vehicle(req: Request, res: Response) {
        try {
            const { vehicle_id } = req.params;
            const response = await this.vehicleServices.get_last_operational_by_vehicle({ vehicle_id });
            res.status(200).json({
                message: "Último registro operacional obtenido correctamente",
                data: response
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al obtener último registro operacional"
            });
            return;
        }
    }

    public async get_last_preoperational_by_vehicle(req: Request, res: Response) {
        try {
            const { vehicle_id } = req.params;
            const response = await this.vehicleServices.get_last_preoperational_by_vehicle({ vehicle_id });
            res.status(200).json({
                message: "Último reporte preoperacional obtenido correctamente",
                data: response
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al obtener último reporte preoperacional"
            });
            return;
        }
    }

    public async get_all_vehicles_last_reports(req: Request, res: Response) {
        try {
            const { page, limit } = req.query;
            const company_id = req.params.company_id || req.query.company_id as string;
            const user_company_id = (req as AuthRequest).user?.company_id;

            const response = await this.vehicleServices.get_all_vehicles_last_reports({
                company_id: user_company_id || company_id,
                page: page ? Number(page) : 1,
                limit: limit ? Number(limit) : 10
            });
            res.status(200).json({
                message: "Vehículos con últimos reportes obtenidos correctamente",
                data: response
            });
        } catch (error) {
            if(error instanceof ResponseError){
                res.status(error.statusCode).json({
                    ok: false,
                    message: error.message
                });
                return;
            }
            res.status(500).json({
                ok: false,
                message: "Error al obtener vehículos con últimos reportes"
            });
            return;
        }
    }
}
