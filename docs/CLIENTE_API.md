# 🏢 API del Cliente - Admin Transporte

Documentación de los endpoints disponibles para el rol de **cliente**.

---

## 📋 Índice

- [Autenticación](#autenticación)
- [Mis Solicitudes](#mis-solicitudes)
  - [Listar mis solicitudes](#get-apiv1solicitudesmy-requests)
  - [Ver detalle de solicitud](#get-apiv1solicitudesmy-requestsid)
- [Crear Solicitud](#crear-solicitud)
  - [Nueva solicitud de servicio](#post-apiv1solicitudesclient)
- [Estados de Solicitud](#estados-de-solicitud)
- [Flujo de Trabajo](#flujo-de-trabajo)
- [Códigos de Error](#códigos-de-error)

---

## 🔐 Autenticación

Todos los endpoints requieren autenticación mediante cookie `_session_token_`.

### Login del cliente

```http
POST /api/v1/clients/login
Content-Type: application/json

{
    "email": "cliente@empresa.com",
    "password": "contraseña123"
}
```

**Respuesta:**
```json
{
    "message": "Sesión iniciada correctamente",
    "data": {
        "token": "eyJhbGciOiJIUzI1NiIs...",
        "client": {
            "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
            "name": "Empresa Cliente S.A.S",
            "contact_name": "Pedro López",
            "email": "cliente@empresa.com"
        }
    }
}
```

> 💡 La cookie `_session_token_` se establece automáticamente.

---

## 📋 Mis Solicitudes

### `GET /api/v1/solicitudes/my-requests`

Obtiene todas las solicitudes de servicio creadas por el cliente autenticado.

#### Query Parameters

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `page` | number | ❌ | Número de página (default: 1) |
| `limit` | number | ❌ | Resultados por página (default: 10) |
| `status` | string | ❌ | Estado de aprobación: `pending`, `accepted`, `rejected` |
| `service_status` | string | ❌ | Estado del servicio: `not-started`, `started`, `finished` |
| `fecha_inicio` | string | ❌ | Filtrar desde fecha (formato: YYYY-MM-DD) |
| `fecha_fin` | string | ❌ | Filtrar hasta fecha (formato: YYYY-MM-DD) |

#### Ejemplos de Petición

```bash
# Obtener todas mis solicitudes
GET /api/v1/solicitudes/my-requests

# Solicitudes pendientes de aprobación
GET /api/v1/solicitudes/my-requests?status=pending

# Solicitudes aprobadas
GET /api/v1/solicitudes/my-requests?status=accepted

# Solicitudes rechazadas
GET /api/v1/solicitudes/my-requests?status=rejected

# Servicios en curso
GET /api/v1/solicitudes/my-requests?status=accepted&service_status=started

# Servicios completados
GET /api/v1/solicitudes/my-requests?status=accepted&service_status=finished

# Solicitudes de enero 2024
GET /api/v1/solicitudes/my-requests?fecha_inicio=2024-01-01&fecha_fin=2024-01-31

# Paginación
GET /api/v1/solicitudes/my-requests?page=2&limit=5
```

#### Respuesta Exitosa (200)

```json
{
    "message": "Solicitudes del cliente obtenidas correctamente",
    "data": {
        "solicitudes": [
            {
                "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
                "he": "HE-2024-001",
                "empresa": "travel",
                "fecha": "2024-01-15T00:00:00.000Z",
                "hora_inicio": "08:00",
                "hora_final": "16:30",
                "total_horas": 8.5,
                "origen": "Aeropuerto El Dorado, Bogotá",
                "destino": "Hotel Hilton, Cartagena",
                "n_pasajeros": 8,
                "contacto": "Diana Martínez",
                "novedades": "Servicio completado sin novedades",
                "status": "accepted",
                "service_status": "finished",
                "vehiculo_id": {
                    "_id": "...",
                    "placa": "ABC123",
                    "type": "van",
                    "flota": "propio",
                    "seats": 15,
                    "name": "Van Sprinter 2023"
                },
                "conductor": {
                    "_id": "...",
                    "full_name": "Andrés López",
                    "contact": {
                        "phone": "3211112223"
                    }
                },
                "created": "2024-01-10T14:30:00.000Z"
            },
            {
                "_id": "64f8a1b2c3d4e5f6g7h8i9j1",
                "fecha": "2024-01-20T00:00:00.000Z",
                "hora_inicio": "10:00",
                "origen": "Bogotá",
                "destino": "Villa de Leyva",
                "n_pasajeros": 12,
                "contacto": "Diana Martínez",
                "status": "pending",
                "service_status": "not-started",
                "vehiculo_id": null,
                "conductor": null,
                "created": "2024-01-18T09:15:00.000Z"
            }
        ],
        "pagination": {
            "total": 15,
            "page": 1,
            "limit": 10,
            "totalPages": 2
        }
    }
}
```

---

### `GET /api/v1/solicitudes/my-requests/:id`

Obtiene el detalle completo de una solicitud específica.

> 🔒 Solo permite acceso a solicitudes propias del cliente autenticado.

#### URL Parameters

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | ID de la solicitud (MongoDB ObjectId) |

#### Ejemplo de Petición

```bash
GET /api/v1/solicitudes/my-requests/64f8a1b2c3d4e5f6g7h8i9j0
```

#### Respuesta Exitosa (200)

```json
{
    "message": "Solicitud obtenida correctamente",
    "data": {
        "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
        "he": "HE-2024-001",
        "empresa": "travel",
        "fecha": "2024-01-15T00:00:00.000Z",
        "hora_inicio": "08:00",
        "hora_final": "16:30",
        "total_horas": 8.5,
        "origen": "Aeropuerto El Dorado, Bogotá",
        "destino": "Hotel Hilton, Cartagena",
        "n_pasajeros": 8,
        "contacto": "Diana Martínez",
        "novedades": "Servicio completado sin novedades",
        "status": "accepted",
        "service_status": "finished",
        "vehiculo_id": {
            "_id": "...",
            "placa": "ABC123",
            "type": "van",
            "flota": "propio",
            "seats": 15,
            "name": "Van Sprinter 2023",
            "description": "Van Mercedes con A/C, WiFi",
            "picture": {
                "url": "https://...",
                "type": "image"
            }
        },
        "conductor": {
            "_id": "...",
            "full_name": "Andrés López",
            "contact": {
                "phone": "3211112223",
                "email": "andres@transporte.com"
            },
            "avatar": {
                "url": "https://..."
            }
        },
        "created": "2024-01-10T14:30:00.000Z"
    }
}
```

#### Respuesta de Error (404)

```json
{
    "ok": false,
    "message": "Solicitud no encontrada o no tienes acceso"
}
```

---

## ➕ Crear Solicitud

### `POST /api/v1/solicitudes/client`

Crea una nueva solicitud de servicio. La solicitud queda en estado `pending` hasta que un coordinador la apruebe.

#### Body (JSON)

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `bitacora_id` | string | ✅ | ID de la bitácora del mes |
| `fecha` | string | ✅ | Fecha del servicio (YYYY-MM-DD) |
| `hora_inicio` | string | ✅ | Hora de inicio (HH:MM) |
| `origen` | string | ✅ | Lugar de origen/recogida |
| `destino` | string | ✅ | Lugar de destino |
| `n_pasajeros` | number | ✅ | Número de pasajeros |

#### Ejemplo de Petición

```bash
POST /api/v1/solicitudes/client
Content-Type: application/json

{
    "bitacora_id": "64f8a1b2c3d4e5f6g7h8i9j0",
    "fecha": "2024-02-15",
    "hora_inicio": "08:00",
    "origen": "Aeropuerto El Dorado, Bogotá",
    "destino": "Centro de Convenciones, Medellín",
    "n_pasajeros": 15
}
```

#### Respuesta Exitosa (201)

```json
{
    "message": "Solicitud creada exitosamente"
}
```

> 📧 Se envía automáticamente un email de notificación a los coordinadores de la empresa.

---

## 📊 Estados de Solicitud

### Estado de Aprobación (`status`)

| Estado | Descripción | Siguiente paso |
|--------|-------------|----------------|
| `pending` | Esperando aprobación del coordinador | Coordinador acepta o rechaza |
| `accepted` | Aprobada, con vehículo y conductor asignado | El servicio puede iniciar |
| `rejected` | Rechazada por el coordinador | Crear nueva solicitud |

### Estado del Servicio (`service_status`)

| Estado | Descripción | Acción |
|--------|-------------|--------|
| `not-started` | Servicio programado, aún no iniciado | Conductor inicia el servicio |
| `started` | Servicio en curso | Conductor finaliza al terminar |
| `finished` | Servicio completado | - |

---

## 🔄 Flujo de Trabajo

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUJO DEL CLIENTE                            │
└─────────────────────────────────────────────────────────────────┘

1️⃣ LOGIN
   POST /api/v1/clients/login
   └── Obtiene cookie de sesión

2️⃣ CREAR SOLICITUD DE SERVICIO
   POST /api/v1/solicitudes/client
   └── status: "pending"
   └── 📧 Notificación enviada a coordinadores

3️⃣ ESPERAR APROBACIÓN
   GET /api/v1/solicitudes/my-requests?status=pending
   └── Ver solicitudes pendientes

4️⃣ SOLICITUD APROBADA
   GET /api/v1/solicitudes/my-requests/:id
   └── Ver vehículo y conductor asignado
   └── status: "accepted"

   ❌ SOLICITUD RECHAZADA
   └── status: "rejected"
   └── Crear nueva solicitud si es necesario

5️⃣ DÍA DEL SERVICIO
   GET /api/v1/solicitudes/my-requests?status=accepted&service_status=started
   └── Seguimiento del servicio en curso

6️⃣ SERVICIO COMPLETADO
   GET /api/v1/solicitudes/my-requests?status=accepted&service_status=finished
   └── Ver historial de servicios
```

---

## 🎨 Información Visual por Estado

### Colores sugeridos para UI

```typescript
const STATUS_COLORS = {
    // Estado de aprobación
    pending: { bg: '#FEF3C7', text: '#92400E', label: 'Pendiente' },
    accepted: { bg: '#D1FAE5', text: '#065F46', label: 'Aprobada' },
    rejected: { bg: '#FEE2E2', text: '#991B1B', label: 'Rechazada' },
    
    // Estado del servicio
    'not-started': { bg: '#E0E7FF', text: '#3730A3', label: 'Por iniciar' },
    started: { bg: '#DBEAFE', text: '#1E40AF', label: 'En curso' },
    finished: { bg: '#D1FAE5', text: '#065F46', label: 'Finalizado' }
};
```

### Iconos sugeridos

| Estado | Icono |
|--------|-------|
| `pending` | ⏳ Reloj |
| `accepted` | ✅ Check |
| `rejected` | ❌ X |
| `not-started` | 📅 Calendario |
| `started` | 🚐 Vehículo |
| `finished` | 🏁 Bandera |

---

## ⚠️ Códigos de Error

| Código | Descripción |
|--------|-------------|
| `200` | Operación exitosa |
| `201` | Recurso creado exitosamente |
| `400` | Error de validación |
| `401` | No autenticado o sesión expirada |
| `404` | Recurso no encontrado |
| `500` | Error interno del servidor |

### Formato de Error

```json
{
    "ok": false,
    "message": "Descripción del error"
}
```

---

## 📱 Ejemplo de Implementación (React/Frontend)

```typescript
// Tipos
interface Solicitud {
    _id: string;
    he?: string;
    fecha: string;
    hora_inicio: string;
    hora_final?: string;
    origen: string;
    destino: string;
    n_pasajeros: number;
    status: 'pending' | 'accepted' | 'rejected';
    service_status: 'not-started' | 'started' | 'finished';
    vehiculo_id?: {
        placa: string;
        type: string;
        name: string;
    };
    conductor?: {
        full_name: string;
        contact: { phone: string };
    };
}

interface SolicitudesResponse {
    solicitudes: Solicitud[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}

// API Client
const API_BASE = '/api/v1';

// Obtener mis solicitudes
const getMisSolicitudes = async (params?: {
    status?: string;
    service_status?: string;
    page?: number;
    limit?: number;
}): Promise<SolicitudesResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.append('status', params.status);
    if (params?.service_status) searchParams.append('service_status', params.service_status);
    if (params?.page) searchParams.append('page', params.page.toString());
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    
    const response = await fetch(`${API_BASE}/solicitudes/my-requests?${searchParams}`, {
        credentials: 'include'
    });
    const data = await response.json();
    return data.data;
};

// Obtener detalle de solicitud
const getSolicitudDetalle = async (id: string): Promise<Solicitud> => {
    const response = await fetch(`${API_BASE}/solicitudes/my-requests/${id}`, {
        credentials: 'include'
    });
    const data = await response.json();
    return data.data;
};

// Crear nueva solicitud
const crearSolicitud = async (payload: {
    bitacora_id: string;
    fecha: string;
    hora_inicio: string;
    origen: string;
    destino: string;
    n_pasajeros: number;
}): Promise<void> => {
    const response = await fetch(`${API_BASE}/solicitudes/client`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
    }
};

// Ejemplo de componente React
const MisSolicitudes: React.FC = () => {
    const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
    const [loading, setLoading] = useState(true);
    const [filtro, setFiltro] = useState<string>('all');

    useEffect(() => {
        const cargarSolicitudes = async () => {
            setLoading(true);
            try {
                const params = filtro !== 'all' ? { status: filtro } : undefined;
                const data = await getMisSolicitudes(params);
                setSolicitudes(data.solicitudes);
            } catch (error) {
                console.error('Error:', error);
            } finally {
                setLoading(false);
            }
        };
        
        cargarSolicitudes();
    }, [filtro]);

    return (
        <div>
            <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
                <option value="all">Todas</option>
                <option value="pending">Pendientes</option>
                <option value="accepted">Aprobadas</option>
                <option value="rejected">Rechazadas</option>
            </select>
            
            {loading ? (
                <p>Cargando...</p>
            ) : (
                <ul>
                    {solicitudes.map((sol) => (
                        <li key={sol._id}>
                            {sol.origen} → {sol.destino} | {sol.status}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
```

---

## 📞 Contacto

Para dudas o soporte técnico, contactar al equipo de desarrollo.

