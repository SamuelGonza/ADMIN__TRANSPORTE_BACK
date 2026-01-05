import { Request, Response } from "express";
import { ContractsService } from "@/services/contracts.service";
import { ResponseError } from "@/utils/errors";
import { AuthRequest } from "@/utils/express";

export class ContractsController {
    private contractsService = new ContractsService();

    public async create_contract(req: Request, res: Response) {
        try {
            const user_company_id = (req as AuthRequest).user?.company_id;
            const created_by = (req as AuthRequest).user?._id;
            const { company_id, ...payload } = req.body;

            const contract = await this.contractsService.create_contract({
                company_id: user_company_id || company_id,
                created_by,
                payload
            });

            res.status(201).json({
                message: "Contrato creado exitosamente",
                data: contract
            });
        } catch (error) {
            if (error instanceof ResponseError) {
                res.status(error.statusCode).json({ ok: false, message: error.message });
                return;
            }
            res.status(500).json({ ok: false, message: "Error al crear el contrato" });
        }
    }

    public async get_contract_by_id(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const user_company_id = (req as AuthRequest).user?.company_id;
            const contract = await this.contractsService.get_contract_by_id({
                id,
                company_id: user_company_id
            });
            res.status(200).json({ message: "Contrato obtenido correctamente", data: contract });
        } catch (error) {
            if (error instanceof ResponseError) {
                res.status(error.statusCode).json({ ok: false, message: error.message });
                return;
            }
            res.status(500).json({ ok: false, message: "Error al obtener el contrato" });
        }
    }

    public async get_all_contracts(req: Request, res: Response) {
        try {
            const { only_active } = req.query;
            const user_company_id = (req as AuthRequest).user?.company_id;

            const contracts = await this.contractsService.get_all_contracts({
                company_id: user_company_id,
                only_active: only_active === "true" || only_active === "1"
            });

            res.status(200).json({ message: "Contratos obtenidos correctamente", data: contracts });
        } catch (error) {
            if (error instanceof ResponseError) {
                res.status(error.statusCode).json({ ok: false, message: error.message });
                return;
            }
            res.status(500).json({ ok: false, message: "Error al listar contratos" });
        }
    }

    public async get_contracts_by_client(req: Request, res: Response) {
        try {
            const { client_id } = req.params;
            const { only_active } = req.query;
            const user_company_id = (req as AuthRequest).user?.company_id;

            const contracts = await this.contractsService.get_contracts_by_client({
                client_id,
                company_id: user_company_id,
                only_active: only_active === "true"
            });

            res.status(200).json({ message: "Contratos obtenidos correctamente", data: contracts });
        } catch (error) {
            if (error instanceof ResponseError) {
                res.status(error.statusCode).json({ ok: false, message: error.message });
                return;
            }
            res.status(500).json({ ok: false, message: "Error al listar contratos" });
        }
    }

    public async update_contract(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const user_company_id = (req as AuthRequest).user?.company_id;
            const updated_by = (req as AuthRequest).user?._id;
            const payload = req.body;

            const contract = await this.contractsService.update_contract({
                id,
                company_id: user_company_id,
                updated_by,
                payload
            });

            res.status(200).json({ message: "Contrato actualizado correctamente", data: contract });
        } catch (error) {
            if (error instanceof ResponseError) {
                res.status(error.statusCode).json({ ok: false, message: error.message });
                return;
            }
            res.status(500).json({ ok: false, message: "Error al actualizar el contrato" });
        }
    }

    public async charge_contract(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const user_company_id = (req as AuthRequest).user?.company_id;
            const created_by = (req as AuthRequest).user?._id;
            const { amount, solicitud_id, notes } = req.body;

            const contract = await this.contractsService.charge_contract({
                contract_id: id,
                company_id: user_company_id,
                amount: Number(amount),
                solicitud_id,
                created_by,
                notes
            });

            res.status(200).json({ message: "Cargo aplicado correctamente", data: contract });
        } catch (error) {
            if (error instanceof ResponseError) {
                res.status(error.statusCode).json({ ok: false, message: error.message });
                return;
            }
            res.status(500).json({ ok: false, message: "Error al aplicar cargo" });
        }
    }
}









