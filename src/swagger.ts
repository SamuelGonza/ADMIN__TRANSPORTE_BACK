import swaggerJSDoc from "swagger-jsdoc";
import { GLOBAL_ENV } from "@/utils/constants";

const isProd = process.env.NODE_ENV === "production";

/**
 * Nota sobre auth:
 * - La API usa cookie httpOnly `_session_token_`.
 * - Para facilitar "Try it out" en Swagger UI, también documentamos `bearerAuth`.
 *   (Si el backend no acepta Authorization todavía, Swagger igual sirve como documentación.)
 */
export const swaggerSpec = swaggerJSDoc({
    definition: {
        openapi: "3.0.3",
        info: {
            title: "ADMIN TRANSPORTE API",
            version: "1.0.0",
            description: [
                "Documentación OpenAPI/Swagger del backend.",
                "",
                "Autenticación:",
                "- Cookie de sesión: `_session_token_` (httpOnly).",
                "- Roles: superadmon, admin, coordinador, comercia, operador, conductor, contabilidad, cliente.",
            ].join("\n"),
        },
        servers: [
            {
                // Server URL puede ser relativa (recomendado para entornos)
                url: GLOBAL_ENV.ROUTER_SUBFIJE || "/",
            },
        ],
        tags: [
            { name: "Health", description: "Endpoints de verificación" },
            { name: "Users", description: "Usuarios internos (staff) y sesión" },
            { name: "Clients", description: "Clientes y sesión de cliente" },
            { name: "Companies", description: "Empresas" },
            { name: "Vehicles", description: "Vehículos, documentos y reportes" },
            { name: "Solicitudes", description: "Solicitudes / servicios" },
            { name: "Contracts", description: "Contratos y cargos" },
            { name: "Locations", description: "Orígenes/Destinos (autocompletado)" },
        ],
        components: {
            securitySchemes: {
                sessionCookie: {
                    type: "apiKey",
                    in: "cookie",
                    name: "_session_token_",
                    description: "Cookie de sesión (httpOnly) creada en login.",
                },
                bearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "JWT",
                    description: "Opcional para pruebas desde Swagger (Authorization: Bearer <token>).",
                },
            },
            schemas: {
                ErrorResponse: {
                    type: "object",
                    properties: {
                        ok: { type: "boolean", example: false },
                        message: { type: "string", example: "Error" },
                    },
                    required: ["ok", "message"],
                },
                MessageResponse: {
                    type: "object",
                    properties: {
                        message: { type: "string", example: "Operación exitosa" },
                    },
                    required: ["message"],
                },
                HealthResponse: {
                    type: "object",
                    properties: {
                        ok: { type: "boolean", example: true },
                        message: { type: "string", example: "Server is running" },
                        timestamp: { type: "string", format: "date-time" },
                        ip: { type: "string", example: "::1" },
                    },
                    required: ["ok", "message", "timestamp", "ip"],
                },

                // ========= AUTH =========
                UserLoginRequest: {
                    type: "object",
                    properties: {
                        email: { type: "string", format: "email", example: "admin@empresa.com" },
                        password: { type: "string", example: "MiPassword123" },
                    },
                    required: ["email", "password"],
                },
                ClientLoginRequest: {
                    type: "object",
                    properties: {
                        email: { type: "string", format: "email", example: "cliente@empresa.com" },
                        password: { type: "string", example: "MiPassword123" },
                    },
                    required: ["email", "password"],
                },
                UserLoginData: {
                    type: "object",
                    properties: {
                        token: { type: "string", description: "JWT de sesión" },
                        user: {
                            type: "object",
                            properties: {
                                full_name: { type: "string", example: "Juan Pérez" },
                                avatar: { type: "string", example: "https://..." },
                                role: { type: "string", example: "admin" },
                                company_id: { type: "string", example: "66b..." },
                                company_name: { type: "string", example: "Mi Empresa SAS" },
                                company_logo: {
                                    oneOf: [
                                        { type: "string", example: "https://..." },
                                        { type: "object" },
                                    ],
                                },
                            },
                            required: ["full_name", "avatar", "role", "company_id"],
                        },
                    },
                    required: ["token", "user"],
                },
                ClientLoginData: {
                    type: "object",
                    properties: {
                        token: { type: "string", description: "JWT de sesión" },
                        client: {
                            type: "object",
                            properties: {
                                _id: { type: "string" },
                                name: { type: "string" },
                                contact_name: { type: "string" },
                                contact_phone: { type: "string" },
                                email: { type: "string", format: "email" },
                                company_id: { type: "string" },
                                company_name: { type: "string" },
                                company_document: { type: "object" },
                            },
                            required: ["_id", "name", "email", "company_id"],
                        },
                    },
                    required: ["token", "client"],
                },
                EnvelopeUserLogin: {
                    type: "object",
                    properties: {
                        message: { type: "string" },
                        data: { $ref: "#/components/schemas/UserLoginData" },
                    },
                    required: ["message", "data"],
                },
                EnvelopeClientLogin: {
                    type: "object",
                    properties: {
                        message: { type: "string" },
                        data: { $ref: "#/components/schemas/ClientLoginData" },
                    },
                    required: ["message", "data"],
                },

                // ========= PAGINATION =========
                UsersPagination: {
                    type: "object",
                    properties: {
                        current_page: { type: "integer", example: 1 },
                        total_pages: { type: "integer", example: 5 },
                        total_users: { type: "integer", example: 42 },
                        limit: { type: "integer", example: 10 },
                        has_next_page: { type: "boolean", example: true },
                        has_prev_page: { type: "boolean", example: false },
                    },
                    required: ["current_page", "total_pages", "total_users", "limit", "has_next_page", "has_prev_page"],
                },
                VehiclesPagination: {
                    type: "object",
                    properties: {
                        current_page: { type: "integer", example: 1 },
                        total_pages: { type: "integer", example: 5 },
                        total_vehicles: { type: "integer", example: 42 },
                        limit: { type: "integer", example: 10 },
                        has_next_page: { type: "boolean", example: true },
                        has_prev_page: { type: "boolean", example: false },
                    },
                    required: ["current_page", "total_pages", "total_vehicles", "limit", "has_next_page", "has_prev_page"],
                },
                CompaniesPagination: {
                    type: "object",
                    properties: {
                        current_page: { type: "integer", example: 1 },
                        total_pages: { type: "integer", example: 5 },
                        total_companies: { type: "integer", example: 42 },
                        limit: { type: "integer", example: 10 },
                        has_next_page: { type: "boolean", example: true },
                        has_prev_page: { type: "boolean", example: false },
                    },
                    required: ["current_page", "total_pages", "total_companies", "limit", "has_next_page", "has_prev_page"],
                },

                // ========= LIGHT ENTITIES (para documentación) =========
                Location: {
                    type: "object",
                    properties: {
                        _id: { type: "string" },
                        company_id: { type: "string" },
                        name: { type: "string" },
                        normalized_name: { type: "string" },
                        usage_count: { type: "integer" },
                        last_used: { type: "string", format: "date-time" },
                        created: { type: "string", format: "date-time" },
                    },
                },
            },
        },
    },
    apis: isProd
        ? ["dist/routes/*.js", "dist/srv_config.js"]
        : ["src/routes/*.ts", "src/srv_config.ts"],
});


