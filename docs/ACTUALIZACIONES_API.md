# 📢 Actualizaciones de la API - Admin Transporte

**Última actualización:** Diciembre 2024

Este documento detalla los endpoints nuevos y modificados para que el frontend se ponga al día.

---

## 📋 Índice

- [Gestión de Sesiones](#gestión-de-sesiones)
  - [Usuarios (Users)](#usuarios-users)
  - [Clientes (Clients)](#clientes-clients)
- [Solicitudes del Cliente](#solicitudes-del-cliente)
- [Solicitudes del Conductor](#solicitudes-del-conductor)
- [Resumen de Rutas](#resumen-de-rutas)

---

## 🔐 Gestión de Sesiones

### Usuarios (Users)

Base URL: `/api/v1/users`

---

#### `GET /api/v1/users/me`

**Descripción:** Obtiene la información del usuario autenticado. Útil para verificar si la sesión está activa al cargar la app.

**Autenticación:** ✅ Requiere sesión activa (cualquier rol de usuario)

**Respuesta Exitosa (200):**
```json
{
    "message": "Sesión válida",
    "data": {
        "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
        "full_name": "Juan Pérez",
        "document": { "type": "cc", "number": 1234567890 },
        "avatar": { "url": "https://...", "public_id": "...", "type": "image" },
        "role": "admin",
        "contact": {
            "email": "juan@empresa.com",
            "phone": "3001234567",
            "address": "Calle 123"
        },
        "email": "juan@empresa.com",
        "company_id": "64f8a1b2c3d4e5f6g7h8i9j1",
        "is_active": true,
        "created": "2024-01-15T10:30:00.000Z"
    }
}
```

**Respuesta de Error (401):**
```json
{
    "ok": false,
    "message": "No hay sesión activa"
}
```

---

#### `POST /api/v1/users/refresh`

**Descripción:** Renueva el token de sesión. Genera un nuevo JWT y actualiza la cookie. Útil para mantener la sesión activa.

**Autenticación:** ✅ Requiere sesión activa

**Respuesta Exitosa (200):**
```json
{
    "message": "Sesión renovada exitosamente",
    "data": {
        "token": "eyJhbGciOiJIUzI1NiIs...",
        "user": {
            "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
            "full_name": "Juan Pérez",
            "role": "admin",
            "... más datos del usuario ..."
        }
    }
}
```

> 💡 La cookie `_session_token_` se actualiza automáticamente con el nuevo token.

---

#### `POST /api/v1/users/logout`

**Descripción:** Cierra la sesión del usuario eliminando la cookie.

**Autenticación:** ✅ Requiere sesión activa

**Respuesta Exitosa (200):**
```json
{
    "message": "Sesión cerrada exitosamente"
}
```

> ⚠️ Después de logout, el usuario debe hacer login nuevamente.

---

### Clientes (Clients)

Base URL: `/api/v1/clients`

---

#### `GET /api/v1/clients/me`

**Descripción:** Obtiene la información del cliente autenticado.

**Autenticación:** ✅ Requiere sesión activa de cliente

**Respuesta Exitosa (200):**
```json
{
    "message": "Sesión válida",
    "data": {
        "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
        "name": "Empresa Cliente S.A.S",
        "phone": "6012345678",
        "contact_name": "Pedro López",
        "contact_phone": "3001234567",
        "email": "cliente@empresa.com",
        "company_id": "64f8a1b2c3d4e5f6g7h8i9j1",
        "created": "2024-01-15T10:30:00.000Z"
    }
}
```

---

#### `POST /api/v1/clients/refresh`

**Descripción:** Renueva el token de sesión del cliente.

**Autenticación:** ✅ Requiere sesión activa de cliente

**Respuesta Exitosa (200):**
```json
{
    "message": "Sesión renovada exitosamente",
    "data": {
        "token": "eyJhbGciOiJIUzI1NiIs...",
        "client": {
            "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
            "name": "Empresa Cliente S.A.S",
            "... más datos del cliente ..."
        }
    }
}
```

---

#### `POST /api/v1/clients/logout`

**Descripción:** Cierra la sesión del cliente.

**Autenticación:** ✅ Requiere sesión activa de cliente

**Respuesta Exitosa (200):**
```json
{
    "message": "Sesión cerrada exitosamente"
}
```

---

## 📝 Solicitudes del Cliente

Base URL: `/api/v1/solicitudes`

---

#### `GET /api/v1/solicitudes/my-requests`

**Descripción:** Obtiene todas las solicitudes creadas por el cliente autenticado.

**Autenticación:** ✅ Requiere sesión de cliente

**Query Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `page` | number | Página (default: 1) |
| `limit` | number | Resultados por página (default: 10) |
| `status` | string | `pending`, `accepted`, `rejected` |
| `service_status` | string | `not-started`, `started`, `finished` |
| `fecha_inicio` | string | Desde fecha (YYYY-MM-DD) |
| `fecha_fin` | string | Hasta fecha (YYYY-MM-DD) |

**Ejemplos:**
```bash
# Todas mis solicitudes
GET /api/v1/solicitudes/my-requests

# Solicitudes pendientes de aprobación
GET /api/v1/solicitudes/my-requests?status=pending

# Solicitudes aprobadas y en curso
GET /api/v1/solicitudes/my-requests?status=accepted&service_status=started

# Servicios completados
GET /api/v1/solicitudes/my-requests?service_status=finished
```

**Respuesta Exitosa (200):**
```json
{
    "message": "Solicitudes del cliente obtenidas correctamente",
    "data": {
        "solicitudes": [
            {
                "_id": "...",
                "he": "HE-2024-001",
                "fecha": "2024-01-15T00:00:00.000Z",
                "hora_inicio": "08:00",
                "origen": "Bogotá",
                "destino": "Medellín",
                "n_pasajeros": 8,
                "status": "accepted",
                "service_status": "finished",
                "vehiculo_id": {
                    "placa": "ABC123",
                    "type": "van",
                    "name": "Van Sprinter"
                },
                "conductor": {
                    "full_name": "Andrés López",
                    "contact": { "phone": "3211112223" }
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

#### `GET /api/v1/solicitudes/my-requests/:id`

**Descripción:** Obtiene el detalle de una solicitud del cliente.

**Autenticación:** ✅ Requiere sesión de cliente

**Respuesta Exitosa (200):**
```json
{
    "message": "Solicitud obtenida correctamente",
    "data": {
        "_id": "...",
        "he": "HE-2024-001",
        "fecha": "2024-01-15T00:00:00.000Z",
        "hora_inicio": "08:00",
        "hora_final": "16:30",
        "total_horas": 8.5,
        "origen": "Bogotá",
        "destino": "Medellín",
        "n_pasajeros": 8,
        "novedades": "Sin novedades",
        "status": "accepted",
        "service_status": "finished",
        "vehiculo_id": {
            "placa": "ABC123",
            "type": "van",
            "name": "Van Sprinter",
            "description": "Van Mercedes con A/C",
            "picture": { "url": "..." }
        },
        "conductor": {
            "full_name": "Andrés López",
            "contact": { "phone": "3211112223" },
            "avatar": { "url": "..." }
        }
    }
}
```

---

## 🚐 Solicitudes del Conductor

Base URL: `/api/v1/solicitudes`

---

#### `GET /api/v1/solicitudes/my-services`

**Descripción:** Obtiene las solicitudes asignadas al conductor autenticado.

**Autenticación:** ✅ Requiere sesión de conductor/operador/coordinador+

**Query Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `page` | number | Página (default: 1) |
| `limit` | number | Resultados por página (default: 10) |
| `service_status` | string | `not-started`, `started`, `finished` |
| `fecha_inicio` | string | Desde fecha (YYYY-MM-DD) |
| `fecha_fin` | string | Hasta fecha (YYYY-MM-DD) |

**Ejemplos:**
```bash
# Todos mis servicios
GET /api/v1/solicitudes/my-services

# Servicios por iniciar
GET /api/v1/solicitudes/my-services?service_status=not-started

# Servicios en curso
GET /api/v1/solicitudes/my-services?service_status=started
```

**Respuesta Exitosa (200):**
```json
{
    "message": "Solicitudes del conductor obtenidas correctamente",
    "data": {
        "solicitudes": [
            {
                "_id": "...",
                "he": "HE-2024-001",
                "fecha": "2024-01-15T00:00:00.000Z",
                "hora_inicio": "08:00",
                "origen": "Aeropuerto El Dorado",
                "destino": "Hotel Hilton",
                "n_pasajeros": 8,
                "service_status": "not-started",
                "cliente": {
                    "name": "Empresa ABC",
                    "contact_name": "Diana Martínez",
                    "contact_phone": "3001234567"
                },
                "vehiculo_id": {
                    "placa": "ABC123",
                    "type": "van",
                    "name": "Van Sprinter"
                }
            }
        ],
        "pagination": { ... }
    }
}
```

---

#### `GET /api/v1/solicitudes/my-services/:id`

**Descripción:** Obtiene el detalle de un servicio asignado al conductor.

**Autenticación:** ✅ Requiere sesión de conductor/operador/coordinador+

---

#### `PUT /api/v1/solicitudes/:id/start`

**Descripción:** Inicia un servicio.

**Autenticación:** ✅ Requiere sesión de conductor/operador/coordinador+

**Respuesta Exitosa (200):**
```json
{
    "message": "Servicio iniciado correctamente",
    "data": { "... solicitud con service_status: started ..." }
}
```

---

#### `PUT /api/v1/solicitudes/:id/finish`

**Descripción:** Finaliza un servicio.

**Autenticación:** ✅ Requiere sesión de conductor/operador/coordinador+

**Body (JSON):**
```json
{
    "hora_final": "16:30",
    "novedades": "Servicio completado sin novedades"
}
```

**Respuesta Exitosa (200):**
```json
{
    "message": "Servicio finalizado correctamente",
    "data": {
        "... solicitud ...",
        "hora_final": "16:30",
        "total_horas": 8.5,
        "service_status": "finished"
    }
}
```

---

## 📊 Resumen de Rutas

### Rutas de Sesión - Users

| Método | Ruta | Descripción | Auth |
|--------|------|-------------|------|
| `GET` | `/api/v1/users/me` | Obtener usuario autenticado | Session |
| `POST` | `/api/v1/users/refresh` | Renovar token | Session |
| `POST` | `/api/v1/users/logout` | Cerrar sesión | Session |

### Rutas de Sesión - Clients

| Método | Ruta | Descripción | Auth |
|--------|------|-------------|------|
| `GET` | `/api/v1/clients/me` | Obtener cliente autenticado | Session |
| `POST` | `/api/v1/clients/refresh` | Renovar token | Session |
| `POST` | `/api/v1/clients/logout` | Cerrar sesión | Session |

### Rutas de Solicitudes - Cliente

| Método | Ruta | Descripción | Auth |
|--------|------|-------------|------|
| `GET` | `/api/v1/solicitudes/my-requests` | Listar mis solicitudes | Cliente |
| `GET` | `/api/v1/solicitudes/my-requests/:id` | Detalle de solicitud | Cliente |

### Rutas de Solicitudes - Conductor

| Método | Ruta | Descripción | Auth |
|--------|------|-------------|------|
| `GET` | `/api/v1/solicitudes/my-services` | Listar servicios asignados | Conductor+ |
| `GET` | `/api/v1/solicitudes/my-services/:id` | Detalle de servicio | Conductor+ |
| `PUT` | `/api/v1/solicitudes/:id/start` | Iniciar servicio | Conductor+ |
| `PUT` | `/api/v1/solicitudes/:id/finish` | Finalizar servicio | Conductor+ |

---

## 💻 Implementación Frontend

### Verificar sesión al cargar la app

```typescript
// Para usuarios
const checkUserSession = async () => {
    try {
        const res = await fetch('/api/v1/users/me', { credentials: 'include' });
        if (res.ok) {
            const { data } = await res.json();
            return data; // Usuario autenticado
        }
        return null; // Sin sesión
    } catch {
        return null;
    }
};

// Para clientes
const checkClientSession = async () => {
    try {
        const res = await fetch('/api/v1/clients/me', { credentials: 'include' });
        if (res.ok) {
            const { data } = await res.json();
            return data; // Cliente autenticado
        }
        return null;
    } catch {
        return null;
    }
};
```

### Mantener sesión activa (refresh)

```typescript
// Cada 30 minutos
setInterval(async () => {
    await fetch('/api/v1/users/refresh', { 
        method: 'POST', 
        credentials: 'include' 
    });
}, 30 * 60 * 1000);
```

### Logout

```typescript
const handleLogout = async () => {
    await fetch('/api/v1/users/logout', { 
        method: 'POST', 
        credentials: 'include' 
    });
    // Redirigir a login
    window.location.href = '/login';
};
```

---

## ⚠️ Importante

1. **Siempre usar `credentials: 'include'`** en las peticiones fetch para enviar las cookies.

2. **Verificar sesión al cargar** la aplicación con `/me` antes de mostrar contenido protegido.

3. **Manejar el 401** globalmente para redirigir a login cuando la sesión expire.

4. **El refresh** renueva la cookie automáticamente, no necesitas guardar el token manualmente.

