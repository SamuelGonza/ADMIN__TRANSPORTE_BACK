
import { UserRoles } from '@/contracts/interfaces/user.interface';
import jwt from "jsonwebtoken"
import bcrypt from 'bcrypt'
import { GLOBAL_ENV } from './constants';


export type TokenSessionPayload = {
    _id: string;
    role: UserRoles;
    company_id?: string;
}

export const generate_numbers = (length:number = 6): number => {
    return Math.floor(10 ** (length - 1) + Math.random() * 9 * 10 ** (length - 1));
}

export const generate_password = ():string => {
    let password = "";

    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const simbols = "#*@"

    for(let i = 0; i < 8; i++) {
        password += characters.charAt(Math.floor(Math.random() * characters.length));
    }

    for(let i = 0; i < 2; i++) {
        password += simbols.charAt(Math.floor(Math.random() * simbols.length));
    }
    
    return password;
}

export const hash_password = async (password: string) => {
    return bcrypt.hash(password, 12);
}

export const compare_password = async (password: string, hashed_password: string) => {
    return bcrypt.compare(password, hashed_password);
}


export const generate_token_session = ({id, role, company_id}: {id: string, role: UserRoles, company_id?: string}) => {
    const token = jwt.sign({_id: id, role, company_id}, GLOBAL_ENV.JWT_SECRET, {expiresIn: "7d"})
    return token
}