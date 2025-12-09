# 🚐 API del Conductor - Admin Transporte

Documentación de los endpoints disponibles para el rol de **conductor**.

---

## 📋 Índice

- [Autenticación](#autenticación)
- [Mis Solicitudes](#mis-solicitudes)
  - [Listar mis servicios](#get-apiv1solicitudesmy-services)
  - [Ver detalle de servicio](#get-apiv1solicitudesmy-servicesid)
- [Gestión de Servicios](#gestión-de-servicios)
  - [Iniciar servicio](#put-apiv1solicitudesidstart)
  - [Finalizar servicio](#put-apiv1solicitudesidfinish)
- [Flujo de Trabajo](#flujo-de-trabajo)
- [Códigos de Error](#códigos-de-error)

---

## 🔐 Autenticación

Todos los endpoints requieren autenticación mediante cookie `_session_token_`.

**Roles permitidos:** `conductor`, `operador`, `coordinador`, `admin`, `superadmon`

### Headers requeridos

```
Cookie: _session_token_=<JWT_TOKEN>
```

### Login del conductor

```http
POST /api/v1/users/login
Content-Type: application/json

{
    "email": "conductor@empresa.com",
    "password": "contraseña123"
}
```

---

## 📋 Mis Solicitudes

### `GET /api/v1/solicitudes/my-services`

Obtiene todas las solicitudes de servicio asignadas al conductor autenticado.

> ⚠️ Solo devuelve solicitudes en estado `accepted` (aprobadas con conductor asignado).

#### Query Parameters

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `page` | number | ❌ | Número de página (default: 1) |
| `limit` | number | ❌ | Resultados por página (default: 10) |
| `service_status` | string | ❌ | Estado del servicio: `not-started`, `started`, `finished` |
| `fecha_inicio` | string | ❌ | Filtrar desde fecha (formato: YYYY-MM-DD) |
| `fecha_fin` | string | ❌ | Filtrar hasta fecha (formato: YYYY-MM-DD) |

#### Ejemplos de Petición

```bash
# Obtener todas mis solicitudes
GET /api/v1/solicitudes/my-services

# Servicios pendientes de iniciar
GET /api/v1/solicitudes/my-services?service_status=not-started

# Servicios en curso
GET /api/v1/solicitudes/my-services?service_status=started

# Servicios finalizados
GET /api/v1/solicitudes/my-services?service_status=finished

# Servicios de enero 2024
GET /api/v1/solicitudes/my-services?fecha_inicio=2024-01-01&fecha_fin=2024-01-31

# Paginación
GET /api/v1/solicitudes/my-services?page=2&limit=5
```

#### Respuesta Exitosa (200)

```json
{
    "message": "Solicitudes del conductor obtenidas correctamente",
    "data": {
        "solicitudes": [
            {
                "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
                "he": "HE-2024-001",
                "empresa": "travel",
                "fecha": "2024-01-15T00:00:00.000Z",
                "hora_inicio": "08:00",
                "origen": "Aeropuerto El Dorado, Bogotá",
                "destino": "Hotel Hilton, Cartagena",
                "n_pasajeros": 8,
                "contacto": "Diana Martínez",
                "novedades": "",
                "service_status": "not-started",
                "cliente": {
                    "_id": "64f8a1b2c3d4e5f6g7h8i9j1",
                    "name": "Empresas ABC Colombia",
                    "contact_name": "Diana Martínez",
                    "contact_phone": "3001234567",
                    "phone": "6012345678",
                    "email": "cliente@empresa.com"
                },
                "vehiculo_id": {
                    "_id": "64f8a1b2c3d4e5f6g7h8i9j2",
                    "placa": "ABC123",
                    "type": "van",
                    "flota": "propio",
                    "seats": 15,
                    "name": "Van Sprinter 2023"
                }
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

### `GET /api/v1/solicitudes/my-services/:id`

Obtiene el detalle completo de una solicitud específica asignada al conductor.

> 🔒 Solo permite acceso si el conductor autenticado está asignado a esa solicitud.

#### URL Parameters

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | ID de la solicitud (MongoDB ObjectId) |

#### Ejemplo de Petición

```bash
GET /api/v1/solicitudes/my-services/64f8a1b2c3d4e5f6g7h8i9j0
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
        "hora_final": "",
        "total_horas": 0,
        "origen": "Aeropuerto El Dorado, Bogotá",
        "destino": "Hotel Hilton, Cartagena",
        "n_pasajeros": 8,
        "contacto": "Diana Martínez",
        "novedades": "",
        "status": "accepted",
        "service_status": "not-started",
        "cliente": {
            "_id": "64f8a1b2c3d4e5f6g7h8i9j1",
            "name": "Empresas ABC Colombia",
            "email": "cliente@empresa.com",
            "contact_name": "Diana Martínez",
            "contact_phone": "3001234567",
            "phone": "6012345678"
        },
        "vehiculo_id": {
            "_id": "64f8a1b2c3d4e5f6g7h8i9j2",
            "placa": "ABC123",
            "type": "van",
            "flota": "propio",
            "seats": 15,
            "name": "Van Sprinter 2023",
            "description": "Van Mercedes con A/C, WiFi y asientos reclinables"
        }
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

## 🎯 Gestión de Servicios

### `PUT /api/v1/solicitudes/:id/start`

Marca el **inicio** del servicio de transporte.

#### Requisitos

- La solicitud debe estar en estado `status: "accepted"`
- El `service_status` debe ser `"not-started"`

#### URL Parameters

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | ID de la solicitud |

#### Ejemplo de Petición

```bash
PUT /api/v1/solicitudes/64f8a1b2c3d4e5f6g7h8i9j0/start
```

#### Respuesta Exitosa (200)

```json
{
    "message": "Servicio iniciado correctamente",
    "data": {
        "message": "Servicio iniciado exitosamente",
        "solicitud": {
            "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
            "service_status": "started",
            "... demás campos de la solicitud ..."
        }
    }
}
```

#### Respuestas de Error

| Código | Mensaje | Causa |
|--------|---------|-------|
| 400 | "Solo se pueden iniciar solicitudes aceptadas" | La solicitud no está aprobada |
| 400 | "El servicio ya fue iniciado" | El servicio ya está en curso o finalizado |
| 404 | "Solicitud no encontrada" | ID inválido |

---

### `PUT /api/v1/solicitudes/:id/finish`

Marca el **fin** del servicio y registra la hora final y novedades.

#### Requisitos

- El `service_status` debe ser `"started"`

#### URL Parameters

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | ID de la solicitud |

#### Body (JSON)

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `hora_final` | string | ✅ | Hora de finalización (formato: HH:MM) |
| `novedades` | string | ❌ | Comentarios o novedades del viaje |

#### Ejemplo de Petición

```bash
PUT /api/v1/solicitudes/64f8a1b2c3d4e5f6g7h8i9j0/finish
Content-Type: application/json

{
    "hora_final": "16:30",
    "novedades": "Servicio completado sin novedades. Cliente satisfecho."
}
```

#### Respuesta Exitosa (200)

```json
{
    "message": "Servicio finalizado correctamente",
    "data": {
        "message": "Servicio finalizado exitosamente",
        "solicitud": {
            "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
            "hora_inicio": "08:00",
            "hora_final": "16:30",
            "total_horas": 8.5,
            "novedades": "Servicio completado sin novedades. Cliente satisfecho.",
            "service_status": "finished",
            "... demás campos ..."
        }
    }
}
```

#### Respuestas de Error

| Código | Mensaje | Causa |
|--------|---------|-------|
| 400 | "El servicio debe estar iniciado para poder finalizarlo" | El servicio no fue iniciado |
| 404 | "Solicitud no encontrada" | ID inválido |

---

## 🔄 Flujo de Trabajo

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUJO DEL CONDUCTOR                          │
└─────────────────────────────────────────────────────────────────┘

1️⃣ LOGIN
   POST /api/v1/users/login
   └── Obtiene cookie de sesión

2️⃣ VER MIS SERVICIOS ASIGNADOS
   GET /api/v1/solicitudes/my-services?service_status=not-started
   └── Lista servicios pendientes de iniciar

3️⃣ VER DETALLE DEL SERVICIO
   GET /api/v1/solicitudes/my-services/:id
   └── Información completa: cliente, vehículo, ruta, horarios

4️⃣ INICIAR SERVICIO
   PUT /api/v1/solicitudes/:id/start
   └── service_status: "not-started" → "started"

5️⃣ DURANTE EL VIAJE
   - Realizar el servicio de transporte
   - Tomar nota de novedades si las hay

6️⃣ FINALIZAR SERVICIO
   PUT /api/v1/solicitudes/:id/finish
   Body: { hora_final, novedades }
   └── service_status: "started" → "finished"
       └── Se calcula automáticamente total_horas

7️⃣ VER SERVICIOS COMPLETADOS
   GET /api/v1/solicitudes/my-services?service_status=finished
   └── Historial de servicios realizados
```

---

## ⚠️ Códigos de Error

| Código | Descripción |
|--------|-------------|
| `200` | Operación exitosa |
| `400` | Error de validación o estado inválido |
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
    he: string;
    fecha: string;
    hora_inicio: string;
    hora_final?: string;
    origen: string;
    destino: string;
    n_pasajeros: number;
    service_status: 'not-started' | 'started' | 'finished';
    cliente: {
        name: string;
        contact_name: string;
        contact_phone: string;
    };
    vehiculo_id: {
        placa: string;
        type: string;
        name: string;
    };
}

// Obtener mis servicios
const getMisServicios = async (status?: string) => {
    const params = new URLSearchParams();
    if (status) params.append('service_status', status);
    
    const response = await fetch(`/api/v1/solicitudes/my-services?${params}`, {
        credentials: 'include'
    });
    return response.json();
};

// Iniciar servicio
const iniciarServicio = async (id: string) => {
    const response = await fetch(`/api/v1/solicitudes/${id}/start`, {
        method: 'PUT',
        credentials: 'include'
    });
    return response.json();
};

// Finalizar servicio
const finalizarServicio = async (id: string, horaFinal: string, novedades?: string) => {
    const response = await fetch(`/api/v1/solicitudes/${id}/finish`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ hora_final: horaFinal, novedades })
    });
    return response.json();
};
```

---

## 📞 Contacto

Para dudas o soporte técnico, contactar al equipo de desarrollo.

