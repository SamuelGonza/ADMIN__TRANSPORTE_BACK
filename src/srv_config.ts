import cors, { CorsOptions } from "cors";
import express, { Application, Request, Response } from "express";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";

import { GLOBAL_ENV, ALLOWED_ORIGINS, ALLOWED_METHODS } from "@/utils/constants";

// Importar rutas
import usersRouter from "@/routes/users.routes";
import companyRouter from "@/routes/company.routes";
import clientRouter from "@/routes/client.routes";
import solicitudesRouter from "@/routes/solicitudes.routes";
import vehiclesRouter from "@/routes/vehicles.routes";

// Configuración CORS con orígenes permitidos
const corsOptions: CorsOptions = {
    origin: ALLOWED_ORIGINS,
    methods: ALLOWED_METHODS,
    credentials: true,
    optionsSuccessStatus: 204,
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
};

const generalLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,    // 10 minutos
    max: 500,                   // 200 requests por ventana de tiempo por IP
    message: {
        ok: false,
        error: "Demasiadas peticiones desde esta IP",
        message: "Límite de 200 peticiones por 5 minutos excedido",
        retryAfter: "5 minutos"
    },
    standardHeaders: true,      // Incluir headers `RateLimit-*` en la respuesta
    legacyHeaders: false,       // Deshabilitar headers `X-RateLimit-*`
});

const app: Application = express();

// #======== MIDDLEWARES ========#
// app.set("trust proxy", false);


app.use(cookieParser())
app.use(express.json());
app.use(cors(corsOptions));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(generalLimiter);
app.use(morgan("dev"));


// #======== ROUTES ========#
app.get(`${GLOBAL_ENV.ROUTER_SUBFIJE}/health`, (req: Request, res: Response) => {   
    console.log('🏥 Health check recibido desde:', req.ip);
    res.status(200).json({
        ok: true,
        message: "Server is running",
        timestamp: new Date().toISOString(),
        ip: req.ip
    });
});

// Documentación Swagger
// app.use(`${GLOBAL_ENV.ROUTER_SUBFIJE}/docs`, swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
//     customCss: '.swagger-ui .topbar { display: none }',
//     customSiteTitle: "CIMARRONA API - Documentación"
// }));

// Rutas de la API
app.use(`${GLOBAL_ENV.ROUTER_SUBFIJE}/users`, usersRouter);
app.use(`${GLOBAL_ENV.ROUTER_SUBFIJE}/companies`, companyRouter);
app.use(`${GLOBAL_ENV.ROUTER_SUBFIJE}/clients`, clientRouter);
app.use(`${GLOBAL_ENV.ROUTER_SUBFIJE}/solicitudes`, solicitudesRouter);
app.use(`${GLOBAL_ENV.ROUTER_SUBFIJE}/vehicles`, vehiclesRouter);

// Manejo de rutas no encontradas (debe ir al final)
app.use((req: Request, res: Response) => {
    res.status(404).json({
        ok: false,
        message: "Route not found"
    });
});


export default app;
