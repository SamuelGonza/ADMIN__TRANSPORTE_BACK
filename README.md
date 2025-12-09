# API Backend - Sistema de Administración de Transporte

## Información General

**Base URL:** `http://localhost:{PORT}/api/v1`

**Autenticación:** La API utiliza autenticación basada en cookies HTTP-only. Al hacer login exitoso, se crea una cookie `_session_token_` que debe enviarse automáticamente en las siguientes peticiones.

**Importante para el Frontend:**
```typescript
// Configuración necesaria para que las cookies funcionen
// Con fetch:
fetch(url, {
    method: "POST",
    credentials: "include",  // ← OBLIGATORIO
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
});



---

## Roles del Sistema

El sistema tiene los siguientes roles con jerarquía de permisos:

| Rol | Descripción | Nivel de Acceso |
|-----|-------------|-----------------|
| `superadmon` | Super Administrador | Acceso total al sistema, puede crear compañías |
| `admin` | Administrador de Compañía | Gestiona su compañía, usuarios, vehículos |
| `coordinador` | Coordinador | Gestiona clientes, solicitudes, vehículos |
| `contabilidad` | Contabilidad | Acceso a información financiera y facturación |
| `operador` | Operador | Gestiona reportes operacionales |
| `conductor` | Conductor | Subir documentos, reportes preoperacionales |
| `cliente` | Cliente | Crear solicitudes de servicio |

---

## Formato de Respuestas

### Respuesta Exitosa (con datos):
```json
{
    "message": "Mensaje descriptivo",
    "data": { ... }
}
```

### Respuesta Exitosa (sin datos):
```json
{
    "message": "Mensaje descriptivo"
}
```

### Respuesta de Error:
```json
{
    "ok": false,
    "message": "Descripción del error"
}
```

---

# 📌 ENDPOINTS

---

## 🔐 USERS (`/api/v1/users`)

### Rutas Públicas (Sin autenticación)

---

#### `POST /api/v1/users/login`

**Descripción:** Inicia sesión de un usuario del sistema (admin, coordinador, conductor, etc.)

**Autenticación:** ❌ No requiere

**Body (JSON):**
```json
{
    "email": "usuario@ejemplo.com",
    "password": "contraseña123"
}
```

**Respuesta Exitosa (200):**
```json
{
    "message": "Sesión iniciada correctamente",
    "data": {
        "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        "user": {
            "full_name": "Juan Pérez",
            "avatar": "https://res.cloudinary.com/...",
            "role": "admin",
            "company_id": "64f8a1b2c3d4e5f6g7h8i9j0",
            "company_name": "Transportes XYZ",
            "company_logo": { "url": "...", "public_id": "...", "type": "image" }
        }
    }
}
```

**Nota:** Esta petición crea automáticamente la cookie `_session_token_` necesaria para las demás peticiones autenticadas.

---

### Rutas de Sesión (Requieren sesión activa)

---

#### `GET /api/v1/users/me`

**Descripción:** Obtiene la información del usuario actualmente autenticado. Útil para verificar si la sesión sigue activa y obtener los datos del usuario al cargar la aplicación.

**Autenticación:** ✅ Requiere sesión activa (cualquier rol)

**Respuesta Exitosa (200):**
```json
{
    "message": "Sesión válida",
    "data": {
        "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
        "full_name": "Juan Pérez",
        "document": { "type": "cc", "number": 1234567890 },
        "avatar": { "url": "...", "public_id": "...", "type": "img" },
        "role": "admin",
        "contact": { "email": "...", "phone": "...", "address": "..." },
        "email": "juan@ejemplo.com",
        "company_id": "...",
        "is_active": true,
        "is_delete": false,
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

**Descripción:** Renueva el token de sesión del usuario. Genera un nuevo token JWT y actualiza la cookie. Útil para mantener la sesión activa sin necesidad de volver a hacer login.

**Autenticación:** ✅ Requiere sesión activa (cualquier rol)

**Respuesta Exitosa (200):**
```json
{
    "message": "Sesión renovada exitosamente",
    "data": {
        "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        "user": {
            "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
            "full_name": "Juan Pérez",
            "role": "admin",
            "... más datos del usuario ..."
        }
    }
}
```

**Nota:** Esta petición actualiza automáticamente la cookie `_session_token_` con el nuevo token.

---

#### `POST /api/v1/users/logout`

**Descripción:** Cierra la sesión del usuario eliminando la cookie de sesión.

**Autenticación:** ✅ Requiere sesión activa (cualquier rol)

**Respuesta Exitosa (200):**
```json
{
    "message": "Sesión cerrada exitosamente"
}
```

**Nota:** Después de esta petición, la cookie `_session_token_` es eliminada y el usuario deberá hacer login nuevamente.

---

#### `POST /api/v1/users/verify-otp`

**Descripción:** Verifica el código OTP enviado al email para activar una nueva cuenta de administrador (cuando se crea una nueva compañía).

**Autenticación:** ❌ No requiere

**Body (JSON):**
```json
{
    "email": "admin@empresa.com",
    "otp_recovery": 123456
}
```

**Respuesta Exitosa (200):**
```json
{
    "message": "Cuenta verificada correctamente"
}
```

**Nota:** Después de verificar, se envía un email con las credenciales de acceso.

---

#### `POST /api/v1/users/reset-password`

**Descripción:** Inicia el proceso de recuperación de contraseña. Envía un código OTP al email del usuario.

**Autenticación:** ❌ No requiere

**Body (JSON):**
```json
{
    "email": "usuario@ejemplo.com"
}
```

**Respuesta Exitosa (200):**
```json
{
    "message": "Proceso de reseteo de contraseña iniciado"
}
```

---

#### `POST /api/v1/users/verify-otp-reset`

**Descripción:** Verifica el código OTP para el reseteo de contraseña.

**Autenticación:** ❌ No requiere

**Body (JSON):**
```json
{
    "email": "usuario@ejemplo.com",
    "otp_recovery": 123456
}
```

**Respuesta Exitosa (200):**
```json
{
    "message": "Código OTP verificado"
}
```

---

#### `POST /api/v1/users/update-password`

**Descripción:** Actualiza la contraseña del usuario después de verificar el OTP.

**Autenticación:** ❌ No requiere

**Body (JSON):**
```json
{
    "email": "usuario@ejemplo.com",
    "new_password": "nuevaContraseña123"
}
```

**Respuesta Exitosa (200):**
```json
{
    "message": "Contraseña actualizada correctamente"
}
```

---

### Rutas Protegidas

---

#### `POST /api/v1/users/register`

**Descripción:** Registra un nuevo usuario en la compañía del administrador autenticado.

**Autenticación:** ✅ Requiere `admin` o `superadmon`

**Body (JSON):**
```json
{
    "full_name": "María García",
    "document": {
        "type": "cc",
        "number": 1234567890
    },
    "role": "conductor",
    "contact": {
        "email": "maria@ejemplo.com",
        "phone": "3001234567",
        "address": "Calle 123 #45-67"
    },
    "email": "maria@ejemplo.com"
}
```

**Tipos de documento válidos:** `cc` (Cédula), `ce` (Cédula Extranjería), `psp` (Pasaporte), `ti` (Tarjeta Identidad), `nit` (NIT)

**Roles válidos:** `coordinador`, `contabilidad`, `operador`, `conductor`

**Respuesta Exitosa (201):**
```json
{
    "message": "Usuario registrado exitosamente"
}
```

**Nota:** Se envía automáticamente un email al usuario con sus credenciales de acceso.

---

#### `POST /api/v1/users/driver-documents`

**Descripción:** Sube los documentos de un conductor (cédula y licencia de conducción, ambas caras).

**Autenticación:** ✅ Requiere `operador`, `admin` o `superadmon`

**Content-Type:** `multipart/form-data`

**Body (FormData):**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `driver_id` | string | ID del conductor (opcional si el usuario autenticado es conductor) |
| `document_front` | File | Imagen frontal de la cédula |
| `document_back` | File | Imagen trasera de la cédula |
| `license_front` | File | Imagen frontal de la licencia |
| `license_back` | File | Imagen trasera de la licencia |

**Respuesta Exitosa (200):**
```json
{
    "message": "Documentos subidos correctamente"
}
```

---

#### `GET /api/v1/users`

**Descripción:** Obtiene la lista de todos los usuarios con filtros y paginación.

**Autenticación:** ✅ Requiere `admin` o `superadmon`

**Query Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `page` | number | Número de página (default: 1) |
| `limit` | number | Usuarios por página (default: 10) |
| `name` | string | Filtrar por nombre (búsqueda parcial) |
| `document` | number | Filtrar por número de documento |
| `email` | string | Filtrar por email exacto |
| `company_id` | string | Filtrar por compañía |
| `role` | string | Filtrar por rol |

**Respuesta Exitosa (200):**
```json
{
    "message": "Usuarios obtenidos correctamente",
    "data": {
        "users": [
            {
                "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
                "full_name": "Juan Pérez",
                "document": { "type": "cc", "number": 1234567890 },
                "avatar": { "url": "...", "public_id": "...", "type": "img" },
                "role": "conductor",
                "contact": { "email": "...", "phone": "...", "address": "..." },
                "email": "juan@ejemplo.com",
                "company_id": "...",
                "is_active": true,
                "is_delete": false,
                "created": "2024-01-15T10:30:00.000Z"
            }
        ],
        "pagination": {
            "current_page": 1,
            "total_pages": 5,
            "total_users": 48,
            "limit": 10,
            "has_next_page": true,
            "has_prev_page": false
        }
    }
}
```

---

#### `GET /api/v1/users/company/:company_id`

**Descripción:** Obtiene los usuarios de una compañía específica.

**Autenticación:** ✅ Requiere `coordinador`, `admin` o `superadmon`

**URL Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `company_id` | string | ID de la compañía |

**Query Parameters:** Igual que `GET /api/v1/users` (page, limit, name, document, email, role)

**Nota:** Si el usuario autenticado tiene `company_id`, se usa ese automáticamente.

**Respuesta:** Igual que `GET /api/v1/users`

---

#### `GET /api/v1/users/:id`

**Descripción:** Obtiene la información de un usuario específico.

**Autenticación:** ✅ Requiere `coordinador`, `admin` o `superadmon`

**URL Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | ID del usuario |

**Respuesta Exitosa (200):**
```json
{
    "message": "Usuario obtenido correctamente",
    "data": {
        "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
        "full_name": "Juan Pérez",
        "document": { "type": "cc", "number": 1234567890 },
        "avatar": { "url": "...", "public_id": "...", "type": "img" },
        "role": "conductor",
        "contact": { "email": "...", "phone": "...", "address": "..." },
        "email": "juan@ejemplo.com",
        "company_id": "...",
        "is_active": true,
        "is_delete": false,
        "created": "2024-01-15T10:30:00.000Z"
    }
}
```

---

#### `PUT /api/v1/users/:id`

**Descripción:** Actualiza la información básica de un usuario.

**Autenticación:** ✅ Requiere `coordinador`, `admin` o `superadmon`

**URL Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | ID del usuario |

**Body (JSON):**
```json
{
    "full_name": "Juan Pérez Actualizado",
    "contact": {
        "email": "juan.nuevo@ejemplo.com",
        "phone": "3009876543",
        "address": "Nueva dirección 456"
    }
}
```

**Respuesta Exitosa (200):**
```json
{
    "message": "Información del usuario actualizada"
}
```

---

#### `PUT /api/v1/users/:id/avatar`

**Descripción:** Actualiza la foto de perfil de un usuario.

**Autenticación:** ✅ Requiere `coordinador`, `admin` o `superadmon`

**Content-Type:** `multipart/form-data`

**URL Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | ID del usuario |

**Body (FormData):**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `avatar` | File | Nueva imagen de perfil |

**Respuesta Exitosa (200):**
```json
{
    "message": "Avatar actualizado correctamente"
}
```

---

#### `PUT /api/v1/users/driver/:driver_id/documents`

**Descripción:** Actualiza los documentos de un conductor existente.

**Autenticación:** ✅ Requiere `operador`, `admin` o `superadmon`

**Content-Type:** `multipart/form-data`

**URL Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `driver_id` | string | ID del conductor |

**Body (FormData):** Igual que `POST /api/v1/users/driver-documents`

**Respuesta Exitosa (200):**
```json
{
    "message": "Documentos actualizados correctamente"
}
```

---

#### `PATCH /api/v1/users/:id/status`

**Descripción:** Cambia el estado activo/inactivo de un usuario.

**Autenticación:** ✅ Requiere `admin` o `superadmon`

**URL Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | ID del usuario |

**Respuesta Exitosa (200):**
```json
{
    "message": "Estado activo cambiado correctamente"
}
```

---

#### `DELETE /api/v1/users/:id`

**Descripción:** Elimina un usuario (soft delete). El usuario queda marcado como eliminado y sus datos sensibles son anonimizados.

**Autenticación:** ✅ Requiere `admin` o `superadmon`

**URL Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | ID del usuario |

**Respuesta Exitosa (200):**
```json
{
    "message": "Usuario eliminado correctamente"
}
```

---

## 🏢 COMPANIES (`/api/v1/companies`)

---

#### `POST /api/v1/companies`

**Descripción:** Crea una nueva compañía junto con su usuario administrador. Se envía un email de verificación al administrador.

**Autenticación:** ✅ Requiere `superadmon`

**Body (JSON):**
```json
{
    "c_payload": {
        "company_name": "Transportes ABC S.A.S",
        "document": {
            "type": "nit",
            "number": 901234567,
            "dv": "8"
        }
    },
    "admin_payload": {
        "full_name": "Carlos Administrador",
        "document": {
            "type": "cc",
            "number": 1234567890
        },
        "contact": {
            "email": "carlos@transportesabc.com",
            "phone": "3001234567",
            "address": "Calle 100 #10-20"
        },
        "email": "carlos@transportesabc.com",
        "password": "contraseñaSegura123"
    }
}
```

**Respuesta Exitosa (201):**
```json
{
    "message": "Compañía creada exitosamente"
}
```

**Nota:** El administrador recibirá un email con código OTP para verificar su cuenta.

---

#### `GET /api/v1/companies`

**Descripción:** Obtiene la lista de todas las compañías registradas.

**Autenticación:** ✅ Requiere `superadmon`

**Query Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `page` | number | Número de página (default: 1) |
| `limit` | number | Compañías por página (default: 10) |
| `name` | string | Filtrar por nombre de compañía |
| `document` | number | Filtrar por número de documento |
| `created` | string | Filtrar por fecha de creación (formato ISO) |

**Respuesta Exitosa (200):**
```json
{
    "message": "Compañías obtenidas correctamente",
    "data": {
        "companies": [
            {
                "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
                "company_name": "Transportes ABC S.A.S",
                "document": { "type": "nit", "number": 901234567, "dv": "8" },
                "logo": { "url": "...", "public_id": "...", "type": "image" },
                "simba_token": "...",
                "fe_id_ref": "...",
                "created": "2024-01-15T10:30:00.000Z"
            }
        ],
        "pagination": {
            "current_page": 1,
            "total_pages": 3,
            "total_companies": 25,
            "limit": 10,
            "has_next_page": true,
            "has_prev_page": false
        }
    }
}
```

---

#### `GET /api/v1/companies/:id`

**Descripción:** Obtiene la información de una compañía específica.

**Autenticación:** ✅ Requiere `admin` o `superadmon`

**URL Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | ID de la compañía (opcional si el usuario tiene company_id) |

**Nota:** Si el usuario autenticado tiene `company_id`, se usa ese automáticamente.

**Respuesta Exitosa (200):**
```json
{
    "message": "Compañía obtenida correctamente",
    "data": {
        "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
        "company_name": "Transportes ABC S.A.S",
        "document": { "type": "nit", "number": 901234567, "dv": "8" },
        "logo": { "url": "...", "public_id": "...", "type": "image" },
        "simba_token": "...",
        "fe_id_ref": "...",
        "created": "2024-01-15T10:30:00.000Z"
    }
}
```

---

#### `GET /api/v1/companies/:id/fe-info`

**Descripción:** Obtiene la información de facturación electrónica de una compañía (token SIMBA y ID de referencia FE).

**Autenticación:** ✅ Requiere `contabilidad`, `admin` o `superadmon`

**URL Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | ID de la compañía (opcional si el usuario tiene company_id) |

**Respuesta Exitosa (200):**
```json
{
    "message": "Información de facturación obtenida correctamente",
    "data": {
        "simba_token": "abc123xyz...",
        "fe_id": "FE-REF-001"
    }
}
```

---

## 👥 CLIENTS (`/api/v1/clients`)

### Rutas Públicas

---

#### `POST /api/v1/clients/login`

**Descripción:** Inicia sesión de un cliente.

**Autenticación:** ❌ No requiere

**Body (JSON):**
```json
{
    "email": "cliente@empresa.com",
    "password": "contraseña123"
}
```

**Respuesta Exitosa (200):**
```json
{
    "message": "Sesión iniciada correctamente",
    "data": {
        "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        "client": {
            "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
            "name": "Empresa Cliente S.A.S",
            "contact_name": "Pedro López",
            "contact_phone": "3001234567",
            "email": "cliente@empresa.com",
            "company_id": "...",
            "company_name": "...",
            "company_document": { ... }
        }
    }
}
```

---

### Rutas de Sesión (Cliente autenticado)

---

#### `GET /api/v1/clients/me`

**Descripción:** Obtiene la información del cliente actualmente autenticado. Útil para verificar si la sesión sigue activa y obtener los datos del cliente al cargar la aplicación.

**Autenticación:** ✅ Requiere sesión activa de cliente

**Respuesta Exitosa (200):**
```json
{
    "message": "Sesión válida",
    "data": {
        "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
        "name": "Empresa Cliente S.A.S",
        "contact_name": "Pedro López",
        "contact_phone": "3001234567",
        "phone": "6012345678",
        "email": "cliente@empresa.com",
        "company_id": "...",
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

#### `POST /api/v1/clients/refresh`

**Descripción:** Renueva el token de sesión del cliente. Genera un nuevo token JWT y actualiza la cookie.

**Autenticación:** ✅ Requiere sesión activa de cliente

**Respuesta Exitosa (200):**
```json
{
    "message": "Sesión renovada exitosamente",
    "data": {
        "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        "client": {
            "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
            "name": "Empresa Cliente S.A.S",
            "contact_name": "Pedro López",
            "... más datos del cliente ..."
        }
    }
}
```

---

#### `POST /api/v1/clients/logout`

**Descripción:** Cierra la sesión del cliente eliminando la cookie de sesión.

**Autenticación:** ✅ Requiere sesión activa de cliente

**Respuesta Exitosa (200):**
```json
{
    "message": "Sesión cerrada exitosamente"
}
```

---

### Rutas Protegidas (Coordinador+)

---

#### `POST /api/v1/clients`

**Descripción:** Crea un nuevo cliente para la compañía. Se le envía un email con sus credenciales de acceso.

**Autenticación:** ✅ Requiere `coordinador`, `admin` o `superadmon`

**Body (JSON):**
```json
{
    "name": "Empresa Cliente S.A.S",
    "contact_name": "Pedro López",
    "contact_phone": "3001234567",
    "email": "pedro@empresacliente.com"
}
```

**Nota:** El `company_id` se toma automáticamente del usuario autenticado.

**Respuesta Exitosa (201):**
```json
{
    "message": "Cliente creado exitosamente"
}
```

---

#### `GET /api/v1/clients`

**Descripción:** Obtiene la lista de clientes de la compañía.

**Autenticación:** ✅ Requiere `coordinador`, `admin` o `superadmon`

**Query Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `page` | number | Número de página (default: 1) |
| `limit` | number | Clientes por página (default: 10) |
| `name` | string | Filtrar por nombre de cliente |
| `email` | string | Filtrar por email |
| `contact_name` | string | Filtrar por nombre de contacto |
| `contact_phone` | string | Filtrar por teléfono de contacto |

**Respuesta Exitosa (200):**
```json
{
    "message": "Clientes obtenidos correctamente",
    "data": {
        "clients": [
            {
                "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
                "name": "Empresa Cliente S.A.S",
                "contact_name": "Pedro López",
                "contact_phone": "3001234567",
                "email": "pedro@empresacliente.com",
                "company_id": { "_id": "...", "name": "...", "document": { ... } },
                "created": "2024-01-15T10:30:00.000Z"
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

#### `GET /api/v1/clients/:id`

**Descripción:** Obtiene la información de un cliente específico.

**Autenticación:** ✅ Requiere `coordinador`, `admin` o `superadmon`

**URL Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | ID del cliente |

**Respuesta Exitosa (200):**
```json
{
    "message": "Cliente obtenido correctamente",
    "data": {
        "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
        "name": "Empresa Cliente S.A.S",
        "contact_name": "Pedro López",
        "contact_phone": "3001234567",
        "phone": "6012345678",
        "email": "pedro@empresacliente.com",
        "company_id": "...",
        "created": "2024-01-15T10:30:00.000Z"
    }
}
```

---

#### `PUT /api/v1/clients/:id`

**Descripción:** Actualiza la información de un cliente.

**Autenticación:** ✅ Requiere `coordinador`, `admin` o `superadmon`

**URL Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | ID del cliente |

**Body (JSON):**
```json
{
    "name": "Empresa Cliente Actualizada S.A.S",
    "contact_name": "Pedro López Nuevo",
    "contact_phone": "3009876543",
    "phone": "6019876543",
    "email": "pedro.nuevo@empresacliente.com"
}
```

**Respuesta Exitosa (200):**
```json
{
    "message": "Información del cliente actualizada"
}
```

---

#### `POST /api/v1/clients/:id/reset-password`

**Descripción:** Resetea la contraseña de un cliente y le envía las nuevas credenciales por email.

**Autenticación:** ✅ Requiere `coordinador`, `admin` o `superadmon`

**URL Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | ID del cliente |

**Respuesta Exitosa (200):**
```json
{
    "message": "Contraseña reseteada exitosamente"
}
```

---

## 📋 SOLICITUDES (`/api/v1/solicitudes`)

---

#### `POST /api/v1/solicitudes/client`

**Descripción:** Crea una nueva solicitud de servicio como cliente. La solicitud queda en estado "pending" esperando aprobación del coordinador.

**Autenticación:** ✅ Requiere `cliente`, `admin` o `superadmon`

**Body (JSON):**
```json
{
    "bitacora_id": "64f8a1b2c3d4e5f6g7h8i9j0",
    "fecha": "2024-02-15",
    "hora_inicio": "08:00",
    "origen": "Bogotá - Terminal Norte",
    "destino": "Medellín - Terminal del Sur",
    "n_pasajeros": 25
}
```

**Nota:** El `client_id` se toma automáticamente del usuario autenticado.

**Respuesta Exitosa (201):**
```json
{
    "message": "Solicitud creada exitosamente"
}
```

**Nota:** Se envía automáticamente una notificación por email a los coordinadores de la compañía.

---

#### `POST /api/v1/solicitudes/coordinator`

**Descripción:** Crea una nueva solicitud de servicio como coordinador. La solicitud se crea ya aprobada con todos los datos completos.

**Autenticación:** ✅ Requiere `coordinador`, `admin` o `superadmon`

**Body (JSON):**
```json
{
    "bitacora_id": "64f8a1b2c3d4e5f6g7h8i9j0",
    "cliente_id": "64f8a1b2c3d4e5f6g7h8i9j1",
    "he": "HE-2024-001",
    "empresa": "national",
    "fecha": "2024-02-15",
    "hora_inicio": "08:00",
    "origen": "Bogotá - Terminal Norte",
    "destino": "Medellín - Terminal del Sur",
    "n_pasajeros": 25,
    "vehiculo_id": "64f8a1b2c3d4e5f6g7h8i9j2",
    "conductor_id": "64f8a1b2c3d4e5f6g7h8i9j3",
    "nombre_cuenta_cobro": "Cuenta Cobro #001",
    "valor_cancelado": 500000,
    "valor_a_facturar": 600000,
    "utilidad": 100000,
    "porcentaje_utilidad": 16.67
}
```

**Valores válidos para `empresa`:** `"national"`, `"travel"`

**Respuesta Exitosa (201):**
```json
{
    "message": "Solicitud creada y aprobada exitosamente"
}
```

---

#### `GET /api/v1/solicitudes`

**Descripción:** Obtiene la lista de solicitudes con filtros y paginación.

**Autenticación:** ✅ Requiere `coordinador`, `admin` o `superadmon`

**Query Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `page` | number | Número de página (default: 1) |
| `limit` | number | Solicitudes por página (default: 10) |
| `bitacora_id` | string | Filtrar por bitácora |
| `cliente_id` | string | Filtrar por cliente |
| `conductor_id` | string | Filtrar por conductor |
| `vehiculo_id` | string | Filtrar por vehículo |
| `status` | string | Filtrar por estado: `pending`, `accepted`, `rejected` |
| `service_status` | string | Filtrar por estado de servicio: `not-started`, `started`, `finished` |
| `empresa` | string | Filtrar por empresa: `national`, `travel` |
| `fecha_inicio` | string | Fecha inicio del rango (formato ISO) |
| `fecha_fin` | string | Fecha fin del rango (formato ISO) |

**Nota:** Si el usuario es `cliente`, automáticamente solo ve sus solicitudes. Si es `conductor`, solo ve las asignadas a él.

**Respuesta Exitosa (200):**
```json
{
    "message": "Solicitudes obtenidas correctamente",
    "data": {
        "solicitudes": [
            {
                "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
                "bitacora_id": "...",
                "he": "HE-2024-001",
                "empresa": "national",
                "fecha": "2024-02-15T00:00:00.000Z",
                "hora_inicio": "08:00",
                "hora_final": "16:00",
                "total_horas": 8,
                "origen": "Bogotá",
                "destino": "Medellín",
                "n_pasajeros": 25,
                "cliente": { "_id": "...", "name": "...", "email": "...", "contact_name": "..." },
                "contacto": "Pedro López",
                "vehiculo_id": { "_id": "...", "placa": "ABC123", "type": "bus" },
                "placa": "ABC123",
                "tipo_vehiculo": "bus",
                "flota": "propio",
                "conductor": { "_id": "...", "name": "...", "phone": "..." },
                "conductor_phone": "3001234567",
                "novedades": "",
                "nombre_cuenta_cobro": "...",
                "valor_cancelado": 500000,
                "valor_a_facturar": 600000,
                "utilidad": 100000,
                "porcentaje_utilidad": 16.67,
                "status": "accepted",
                "service_status": "finished"
            }
        ],
        "pagination": {
            "total": 50,
            "page": 1,
            "limit": 10,
            "totalPages": 5
        }
    }
}
```

---

#### `GET /api/v1/solicitudes/:id`

**Descripción:** Obtiene el detalle completo de una solicitud.

**Autenticación:** ✅ Requiere `coordinador`, `admin` o `superadmon`

**URL Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | ID de la solicitud |

**Respuesta Exitosa (200):**
```json
{
    "message": "Solicitud obtenida correctamente",
    "data": {
        "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
        "bitacora_id": "...",
        "he": "HE-2024-001",
        "empresa": "national",
        "fecha": "2024-02-15T00:00:00.000Z",
        "hora_inicio": "08:00",
        "hora_final": "16:00",
        "total_horas": 8,
        "origen": "Bogotá",
        "destino": "Medellín",
        "n_pasajeros": 25,
        "cliente": { ... },
        "vehiculo_id": { ... },
        "conductor": { ... },
        "created_by": { ... },
        "status": "accepted",
        "service_status": "finished",
        "... más campos ..."
    }
}
```

---

#### `PUT /api/v1/solicitudes/:id/accept`

**Descripción:** Acepta una solicitud pendiente, asignando vehículo, conductor y datos financieros.

**Autenticación:** ✅ Requiere `coordinador`, `admin` o `superadmon`

**URL Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | ID de la solicitud |

**Body (JSON):**
```json
{
    "he": "HE-2024-001",
    "empresa": "national",
    "vehiculo_id": "64f8a1b2c3d4e5f6g7h8i9j2",
    "conductor_id": "64f8a1b2c3d4e5f6g7h8i9j3",
    "nombre_cuenta_cobro": "Cuenta Cobro #001",
    "valor_cancelado": 500000,
    "valor_a_facturar": 600000,
    "utilidad": 100000,
    "porcentaje_utilidad": 16.67
}
```

**Respuesta Exitosa (200):**
```json
{
    "message": "Solicitud aceptada correctamente",
    "data": { ... solicitud actualizada ... }
}
```

---

#### `PUT /api/v1/solicitudes/:id/reject`

**Descripción:** Rechaza una solicitud pendiente.

**Autenticación:** ✅ Requiere `coordinador`, `admin` o `superadmon`

**URL Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | ID de la solicitud |

**Respuesta Exitosa (200):**
```json
{
    "message": "Solicitud rechazada correctamente",
    "data": { ... solicitud actualizada ... }
}
```

---

#### `PUT /api/v1/solicitudes/:id/start`

**Descripción:** Marca el inicio del servicio (ejecutado por el conductor).

**Autenticación:** ✅ Requiere `operador`, `admin` o `superadmon`

**URL Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | ID de la solicitud |

**Respuesta Exitosa (200):**
```json
{
    "message": "Servicio iniciado correctamente",
    "data": { ... solicitud actualizada con service_status: "started" ... }
}
```

---

#### `PUT /api/v1/solicitudes/:id/finish`

**Descripción:** Marca el fin del servicio con hora final y novedades.

**Autenticación:** ✅ Requiere `operador`, `admin` o `superadmon`

**URL Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | ID de la solicitud |

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
        "... solicitud actualizada ...",
        "service_status": "finished",
        "total_horas": 8.5
    }
}
```

---

#### `PUT /api/v1/solicitudes/:id/financial`

**Descripción:** Actualiza los datos financieros de una solicitud (documentos, números de factura, etc.).

**Autenticación:** ✅ Requiere `contabilidad`, `admin` o `superadmon`

**URL Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | ID de la solicitud |

**Body (JSON):**
```json
{
    "doc_soporte": "DOC-2024-001",
    "fecha_cancelado": "2024-02-20",
    "n_egreso": "EGR-001",
    "n_factura": "FAC-2024-0001",
    "fecha_factura": "2024-02-18"
}
```

**Nota:** Todos los campos son opcionales, solo se actualizan los proporcionados.

**Respuesta Exitosa (200):**
```json
{
    "message": "Datos financieros actualizados correctamente",
    "data": { ... solicitud actualizada ... }
}
```

---

## 🚗 VEHICLES (`/api/v1/vehicles`)

---

#### `POST /api/v1/vehicles`

**Descripción:** Crea un nuevo vehículo.

**Autenticación:** ✅ Requiere `admin` o `superadmon`

**Content-Type:** `multipart/form-data`

**Body (FormData):**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `driver_id` | string | ID del conductor asignado |
| `placa` | string | Placa del vehículo |
| `name` | string | Nombre/alias del vehículo (opcional) |
| `description` | string | Descripción (opcional) |
| `seats` | number | Número de asientos |
| `type` | string | Tipo de vehículo |
| `flota` | string | Tipo de flota |
| `owner_id[type]` | string | Tipo de propietario: `Company`, `User`, `Both` |
| `owner_id[company_id]` | string | ID de la compañía propietaria (si aplica) |
| `owner_id[user_id]` | string | ID del usuario propietario (si aplica) |
| `picture` | File | Foto del vehículo (opcional) |

**Tipos de vehículo válidos:** `bus`, `buseta`, `buseton`, `camioneta`, `campero`, `micro`, `van`

**Tipos de flota válidos:** `externo`, `propio`, `afiliado`

**Respuesta Exitosa (201):**
```json
{
    "message": "Vehículo creado exitosamente"
}
```

---

#### `POST /api/v1/vehicles/preoperational`

**Descripción:** Crea un reporte preoperacional del vehículo (ejecutado por el conductor antes de iniciar servicio).

**Autenticación:** ✅ Requiere `operador`, `admin` o `superadmon`

**Content-Type:** `multipart/form-data`

**Body (FormData):**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `vehicle_id` | string | ID del vehículo |
| `driver_id` | string | ID del conductor (opcional si el usuario autenticado es conductor) |
| `reports` | string (JSON) | Array de reportes en formato JSON |
| `reports[0][media]` | File[] | Archivos multimedia del primer reporte |
| `reports[1][media]` | File[] | Archivos multimedia del segundo reporte |
| ... | ... | ... |

**Estructura de `reports` (JSON):**
```json
[
    {
        "description": "Estado de llantas",
        "status": "ok"
    },
    {
        "description": "Nivel de aceite",
        "status": "details"
    },
    {
        "description": "Frenos",
        "status": "failures"
    }
]
```

**Estados válidos:** `ok`, `details`, `failures`

**Respuesta Exitosa (201):**
```json
{
    "message": "Reporte preoperacional creado exitosamente"
}
```

**Nota:** Se envía automáticamente un email a la empresa si hay fallas o detalles que requieren revisión.

---

#### `POST /api/v1/vehicles/operational-bills`

**Descripción:** Registra gastos operacionales del vehículo (combustible, peajes, reparaciones, etc.).

**Autenticación:** ✅ Requiere `operador`, `admin` o `superadmon`

**Content-Type:** `multipart/form-data`

**Body (FormData):**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `vehicle_id` | string | ID del vehículo |
| `user_id` | string | ID del usuario que registra (opcional) |
| `bills` | string (JSON) | Array de gastos en formato JSON |
| `bills[0][media_support]` | File[] | Soportes del primer gasto |
| `bills[1][media_support]` | File[] | Soportes del segundo gasto |
| ... | ... | ... |

**Estructura de `bills` (JSON):**
```json
[
    {
        "type_bill": "fuel",
        "value": 150000,
        "description": "Tanqueo completo estación Terpel"
    },
    {
        "type_bill": "tolls",
        "value": 45000,
        "description": "Peajes ruta Bogotá-Medellín"
    }
]
```

**Tipos de gasto válidos:** `fuel`, `tolls`, `repairs`, `fines`, `parking_lot`

**Respuesta Exitosa (201):**
```json
{
    "message": "Gastos operacionales registrados exitosamente"
}
```

---

#### `GET /api/v1/vehicles`

**Descripción:** Obtiene la lista de todos los vehículos.

**Autenticación:** ✅ Requiere `coordinador`, `admin` o `superadmon`

**Query Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `page` | number | Número de página (default: 1) |
| `limit` | number | Vehículos por página (default: 10) |
| `placa` | string | Filtrar por placa (búsqueda parcial) |
| `type` | string | Filtrar por tipo de vehículo |
| `name` | string | Filtrar por nombre |

**Respuesta Exitosa (200):**
```json
{
    "message": "Vehículos obtenidos correctamente",
    "data": {
        "vehicles": [
            {
                "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
                "driver_id": { "_id": "...", "full_name": "...", "contact": { "phone": "..." } },
                "placa": "ABC123",
                "name": "Bus Ejecutivo 1",
                "description": "Bus con aire acondicionado",
                "seats": 40,
                "type": "bus",
                "flota": "propio",
                "picture": { "url": "...", "public_id": "...", "type": "img" },
                "owner_id": {
                    "type": "Company",
                    "company_id": { "_id": "...", "company_name": "..." },
                    "user_id": null
                },
                "created": "2024-01-15T10:30:00.000Z"
            }
        ],
        "pagination": {
            "current_page": 1,
            "total_pages": 3,
            "total_vehicles": 25,
            "limit": 10,
            "has_next_page": true,
            "has_prev_page": false
        }
    }
}
```

---

#### `GET /api/v1/vehicles/company`
#### `GET /api/v1/vehicles/company/:company_id`

**Descripción:** Obtiene los vehículos de una compañía específica.

**Autenticación:** ✅ Requiere `coordinador`, `admin` o `superadmon`

**URL Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `company_id` | string | ID de la compañía (opcional si el usuario tiene company_id) |

**Query Parameters:** Igual que `GET /api/v1/vehicles`

**Respuesta:** Igual que `GET /api/v1/vehicles`

---

#### `GET /api/v1/vehicles/user/:user_id`

**Descripción:** Obtiene los vehículos asignados a un usuario (propietario).

**Autenticación:** ✅ Requiere `operador`, `admin` o `superadmon`

**URL Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `user_id` | string | ID del usuario propietario |

**Respuesta Exitosa (200):**
```json
{
    "message": "Vehículos del usuario obtenidos correctamente",
    "data": [ ... array de vehículos ... ]
}
```

---

#### `GET /api/v1/vehicles/:id`

**Descripción:** Obtiene el detalle de un vehículo específico.

**Autenticación:** ✅ Requiere `coordinador`, `admin` o `superadmon`

**URL Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | ID del vehículo |

**Respuesta Exitosa (200):**
```json
{
    "message": "Vehículo obtenido correctamente",
    "data": {
        "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
        "driver_id": { ... },
        "placa": "ABC123",
        "name": "Bus Ejecutivo 1",
        "description": "...",
        "seats": 40,
        "type": "bus",
        "flota": "propio",
        "picture": { ... },
        "owner_id": { ... },
        "created": "2024-01-15T10:30:00.000Z"
    }
}
```

---

#### `PUT /api/v1/vehicles/:id`

**Descripción:** Actualiza la información general de un vehículo.

**Autenticación:** ✅ Requiere `admin` o `superadmon`

**URL Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | ID del vehículo |

**Body (JSON):**
```json
{
    "name": "Bus Ejecutivo 1 - Actualizado",
    "description": "Nueva descripción",
    "seats": 42,
    "type": "buseton",
    "flota": "afiliado"
}
```

**Respuesta Exitosa (200):**
```json
{
    "message": "Vehículo actualizado exitosamente"
}
```

---

#### `PUT /api/v1/vehicles/:id/picture`

**Descripción:** Actualiza la foto de un vehículo.

**Autenticación:** ✅ Requiere `admin` o `superadmon`

**Content-Type:** `multipart/form-data`

**URL Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | ID del vehículo |

**Body (FormData):**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `picture` | File | Nueva foto del vehículo |

**Respuesta Exitosa (200):**
```json
{
    "message": "Imagen del vehículo actualizada"
}
```

---

#### `PUT /api/v1/vehicles/:id/owner`

**Descripción:** Actualiza el propietario de un vehículo.

**Autenticación:** ✅ Requiere `admin` o `superadmon`

**URL Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | ID del vehículo |

**Body (JSON):**
```json
{
    "owner_id": {
        "type": "Both",
        "company_id": "64f8a1b2c3d4e5f6g7h8i9j0",
        "user_id": "64f8a1b2c3d4e5f6g7h8i9j1"
    }
}
```

**Respuesta Exitosa (200):**
```json
{
    "message": "Propietario del vehículo actualizado"
}
```

---

#### `PUT /api/v1/vehicles/:id/driver`

**Descripción:** Actualiza el conductor asignado a un vehículo.

**Autenticación:** ✅ Requiere `admin` o `superadmon`

**URL Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | ID del vehículo |

**Body (JSON):**
```json
{
    "driver_id": "64f8a1b2c3d4e5f6g7h8i9j0"
}
```

**Respuesta Exitosa (200):**
```json
{
    "message": "Conductor del vehículo actualizado"
}
```

---

## 🔧 Health Check

#### `GET /api/v1/health`

**Descripción:** Verifica que el servidor esté funcionando correctamente.

**Autenticación:** ❌ No requiere

**Respuesta Exitosa (200):**
```json
{
    "ok": true,
    "message": "Server is running",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "ip": "::1"
}
```

---

## 📝 Notas Adicionales

### Tipos de Archivo Permitidos

El sistema acepta los siguientes tipos de archivo para subida:

**Imágenes:** jpeg, jpg, png, webp, gif, svg, bmp, tiff

**Videos:** mp4, mpeg, webm, avi, mov, wmv, flv

**Documentos:** pdf, doc, docx, xls, xlsx, ppt, pptx, odt, ods, odp, txt, csv, rtf

**Archivos comprimidos:** zip, rar, 7z

**Límite de tamaño:** 50MB por archivo

### Códigos de Error Comunes

| Código | Descripción |
|--------|-------------|
| 400 | Bad Request - Datos inválidos o faltantes |
| 401 | Unauthorized - No autenticado o token inválido |
| 403 | Forbidden - No tiene permisos para esta acción |
| 404 | Not Found - Recurso no encontrado |
| 409 | Conflict - El recurso ya existe |
| 500 | Internal Server Error - Error del servidor |

### Paginación

Todos los endpoints de listado soportan paginación con los siguientes parámetros:

- `page`: Número de página (empezando desde 1)
- `limit`: Cantidad de elementos por página

La respuesta incluye un objeto `pagination` con información sobre la paginación actual.

---

# 📦 INTERFACES Y TYPES

A continuación se documentan todas las interfaces y tipos de datos que maneja el sistema. Estas definiciones son útiles para tipar correctamente el frontend en TypeScript.

---

## Types Globales

### MediaTypes

Representa cualquier archivo multimedia (imagen, video, documento) almacenado en Cloudinary.

```typescript
type MediaTypes = {
    url: string;           // URL pública del archivo
    public_id: string;     // ID único en Cloudinary (usado para eliminar)
    type: string;          // Tipo: "img", "video", "file"
    original_name?: string; // Nombre original del archivo
    file_extension?: string; // Extensión del archivo
}
```

**Ejemplo:**
```json
{
    "url": "https://res.cloudinary.com/xxx/image/upload/v123/abc.jpg",
    "public_id": "abc",
    "type": "img",
    "original_name": "foto_perfil.jpg",
    "file_extension": "jpg"
}
```

---

## User (Usuario)

### UserDocuments

Tipos de documento de identidad válidos.

```typescript
type UserDocuments = "cc" | "ce" | "psp" | "ti" | "nit";
```

| Valor | Descripción |
|-------|-------------|
| `cc` | Cédula de Ciudadanía |
| `ce` | Cédula de Extranjería |
| `psp` | Pasaporte |
| `ti` | Tarjeta de Identidad |
| `nit` | NIT (Número de Identificación Tributaria) |

---

### UserRoles

Roles disponibles en el sistema.

```typescript
type UserRoles = "superadmon" | "admin" | "coordinador" | "contabilidad" | "operador" | "conductor" | "cliente";
```

| Rol | Descripción |
|-----|-------------|
| `superadmon` | Super Administrador - Control total del sistema |
| `admin` | Administrador de Compañía |
| `coordinador` | Coordinador de servicios |
| `contabilidad` | Área de contabilidad |
| `operador` | Operador/Despachador |
| `conductor` | Conductor de vehículos |
| `cliente` | Cliente externo |

---

### User (Interface)

```typescript
interface User {
    _id: string;                    // ID único del usuario
    full_name: string;              // Nombre completo
    document: {
        type: UserDocuments;        // Tipo de documento
        number: number;             // Número de documento
    };
    avatar: MediaTypes;             // Foto de perfil
    role: UserRoles;                // Rol del usuario
    contact: {
        email: string;              // Email de contacto
        phone: string;              // Teléfono
        address: string;            // Dirección
    };
    email: string;                  // Email de acceso (login)
    company_id: string;             // ID de la compañía a la que pertenece
    created: Date;                  // Fecha de creación
    is_active: boolean;             // Si la cuenta está activa
    is_delete: boolean;             // Si fue eliminado (soft delete)
}
```

**Ejemplo de respuesta:**
```json
{
    "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
    "full_name": "Juan Carlos Pérez",
    "document": {
        "type": "cc",
        "number": 1234567890
    },
    "avatar": {
        "url": "https://res.cloudinary.com/...",
        "public_id": "avatar_123",
        "type": "img"
    },
    "role": "conductor",
    "contact": {
        "email": "juan@ejemplo.com",
        "phone": "3001234567",
        "address": "Calle 123 #45-67, Bogotá"
    },
    "email": "juan@ejemplo.com",
    "company_id": "64f8a1b2c3d4e5f6g7h8i9j1",
    "created": "2024-01-15T10:30:00.000Z",
    "is_active": true,
    "is_delete": false
}
```

---

## Company (Compañía)

### Companies (Interface)

```typescript
interface Companies {
    _id: string;                    // ID único de la compañía
    company_name: string;           // Nombre de la compañía
    document: {
        type: UserDocuments;        // Tipo de documento (generalmente "nit")
        number: number;             // Número de NIT
        dv: string;                 // Dígito de verificación
    };
    simba_token?: string;           // Token para facturación electrónica SIMBA
    fe_id_ref?: string;             // ID de referencia para facturación electrónica
    logo: MediaTypes;               // Logo de la compañía
    created: Date;                  // Fecha de creación
}
```

**Ejemplo de respuesta:**
```json
{
    "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
    "company_name": "Transportes ABC S.A.S",
    "document": {
        "type": "nit",
        "number": 901234567,
        "dv": "8"
    },
    "simba_token": "eyJhbGciOiJIUzI1NiIs...",
    "fe_id_ref": "FE-REF-001",
    "logo": {
        "url": "https://res.cloudinary.com/...",
        "public_id": "logo_abc",
        "type": "img"
    },
    "created": "2024-01-15T10:30:00.000Z"
}
```

---

## Client (Cliente)

### Client (Interface)

```typescript
interface Client {
    _id: string;                    // ID único del cliente
    company_id: string;             // ID de la compañía de transporte
    name: string;                   // Nombre de la empresa cliente
    phone: string;                  // Teléfono principal
    contact_name: string;           // Nombre de la persona de contacto
    contact_phone: string;          // Teléfono del contacto
    email: string;                  // Email de acceso
    created: Date;                  // Fecha de creación
}
```

**Ejemplo de respuesta:**
```json
{
    "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
    "company_id": "64f8a1b2c3d4e5f6g7h8i9j1",
    "name": "Empresa Cliente S.A.S",
    "phone": "6012345678",
    "contact_name": "Pedro López",
    "contact_phone": "3001234567",
    "email": "pedro@empresacliente.com",
    "created": "2024-01-15T10:30:00.000Z"
}
```

---

## Vehicle (Vehículo)

### VehicleTypes

Tipos de vehículos disponibles.

```typescript
type VehicleTypes = "bus" | "buseta" | "buseton" | "camioneta" | "campero" | "micro" | "van";
```

| Valor | Descripción |
|-------|-------------|
| `bus` | Bus de gran capacidad |
| `buseta` | Buseta mediana |
| `buseton` | Busetón grande |
| `camioneta` | Camioneta |
| `campero` | Campero/SUV |
| `micro` | Microbús |
| `van` | Van/Furgoneta |

---

### VehicleFlota

Tipos de pertenencia del vehículo a la flota.

```typescript
type VehicleFlota = "externo" | "propio" | "afiliado";
```

| Valor | Descripción |
|-------|-------------|
| `externo` | Vehículo externo/tercero |
| `propio` | Vehículo propio de la empresa |
| `afiliado` | Vehículo afiliado |

---

### VehicleOwnerType

Tipo de propietario del vehículo.

```typescript
type VehicleOwnerType = "Company" | "User" | "Both";
```

| Valor | Descripción |
|-------|-------------|
| `Company` | Propietario es una compañía |
| `User` | Propietario es una persona natural |
| `Both` | Propiedad compartida (compañía y persona) |

---

### Vehicle (Interface)

```typescript
interface Vehicle {
    _id: string;                    // ID único del vehículo
    driver_id: string | User;       // ID o datos del conductor asignado
    placa: string;                  // Placa del vehículo
    name?: string;                  // Nombre/alias del vehículo
    description?: string;           // Descripción adicional
    seats: number;                  // Número de asientos
    flota: VehicleFlota;            // Tipo de flota
    type: VehicleTypes;             // Tipo de vehículo
    picture: MediaTypes;            // Foto del vehículo
    owner_id: {
        type: "Company" | "User" | "Both";  // Tipo de propietario
        company_id: string | Companies;      // ID o datos de la compañía
        user_id: string | User;              // ID o datos del usuario
    };
    created: Date;                  // Fecha de creación
}
```

**Ejemplo de respuesta:**
```json
{
    "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
    "driver_id": {
        "_id": "...",
        "full_name": "Carlos Conductor",
        "contact": { "phone": "3001234567" }
    },
    "placa": "ABC123",
    "name": "Bus Ejecutivo 1",
    "description": "Bus con aire acondicionado y WiFi",
    "seats": 40,
    "flota": "propio",
    "type": "bus",
    "picture": {
        "url": "https://res.cloudinary.com/...",
        "public_id": "bus_123",
        "type": "img"
    },
    "owner_id": {
        "type": "Company",
        "company_id": {
            "_id": "...",
            "company_name": "Transportes ABC"
        },
        "user_id": null
    },
    "created": "2024-01-15T10:30:00.000Z"
}
```

---

## Bitacora y Solicitudes

### Bitacora (Interface)

Representa un período de registro (mes/año) para agrupar solicitudes.

```typescript
interface Bitacora {
    _id: string;                    // ID único
    company_id: string;             // ID de la compañía
    year: string;                   // Año (ej: "2024")
    month: string;                  // Mes (ej: "01", "12")
    created: Date;                  // Fecha de creación
}
```

---

### SolicitudStatus

Estados de aprobación de una solicitud.

```typescript
type SolicitudStatus = "pending" | "accepted" | "rejected";
```

| Valor | Descripción |
|-------|-------------|
| `pending` | Pendiente de aprobación |
| `accepted` | Aprobada |
| `rejected` | Rechazada |

---

### ServiceStatus

Estados de ejecución del servicio.

```typescript
type ServiceStatus = "not-started" | "started" | "finished";
```

| Valor | Descripción |
|-------|-------------|
| `not-started` | Servicio no iniciado |
| `started` | Servicio en curso |
| `finished` | Servicio finalizado |

---

### EmpresaType

Tipo de empresa para la solicitud.

```typescript
type EmpresaType = "travel" | "national";
```

---

### BitacoraSolicitud (Interface)

Representa una solicitud de servicio de transporte.

```typescript
interface BitacoraSolicitud {
    _id: string;                    // ID único
    bitacora_id: string;            // ID de la bitácora padre

    // Información básica del servicio
    he: string;                     // Código HE del servicio
    empresa: "travel" | "national"; // Tipo de empresa
    fecha: Date;                    // Fecha del servicio
    hora_inicio: string;            // Hora de inicio (formato "HH:MM")
    hora_final: string;             // Hora de finalización
    total_horas: number;            // Total de horas del servicio

    // Cliente y contacto
    cliente: string | Client;       // ID o datos del cliente
    contacto: string;               // Nombre del contacto

    // Ruta
    origen: string;                 // Lugar de origen
    destino: string;                // Lugar de destino
    novedades: string;              // Novedades/observaciones

    // Vehículo y conductor
    vehiculo_id: string | Vehicle;  // ID o datos del vehículo
    placa: string;                  // Placa (denormalizado)
    tipo_vehiculo: VehicleTypes;    // Tipo de vehículo
    n_pasajeros: number;            // Número de pasajeros
    flota: VehicleFlota;            // Tipo de flota
    conductor: string | User;       // ID o datos del conductor
    conductor_phone: string;        // Teléfono del conductor

    // Información financiera - Gastos
    nombre_cuenta_cobro: string;    // Nombre de la cuenta de cobro
    valor_cancelado: number;        // Valor pagado al proveedor
    doc_soporte: string;            // Documento soporte
    fecha_cancelado: Date;          // Fecha de pago
    n_egreso: string;               // Número de egreso

    // Información financiera - Ingresos
    valor_a_facturar: number;       // Valor a cobrar al cliente
    n_factura: string;              // Número de factura
    fecha_factura?: Date;           // Fecha de facturación

    // Utilidad
    utilidad: number;               // Utilidad en pesos
    porcentaje_utilidad: number;    // Porcentaje de utilidad

    // Metadata
    created: Date;                  // Fecha de creación
    created_by?: string | User;     // Usuario que creó el registro
    status: SolicitudStatus;        // Estado de aprobación
    service_status: ServiceStatus;  // Estado del servicio
}
```

**Ejemplo de respuesta:**
```json
{
    "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
    "bitacora_id": "64f8a1b2c3d4e5f6g7h8i9j1",
    "he": "HE-2024-0001",
    "empresa": "national",
    "fecha": "2024-02-15T00:00:00.000Z",
    "hora_inicio": "08:00",
    "hora_final": "16:30",
    "total_horas": 8.5,
    "cliente": {
        "_id": "...",
        "name": "Empresa Cliente S.A.S",
        "email": "cliente@empresa.com",
        "contact_name": "Pedro López"
    },
    "contacto": "Pedro López",
    "origen": "Bogotá - Terminal Norte",
    "destino": "Medellín - Terminal del Sur",
    "novedades": "Servicio completado sin novedades",
    "vehiculo_id": {
        "_id": "...",
        "placa": "ABC123",
        "type": "bus"
    },
    "placa": "ABC123",
    "tipo_vehiculo": "bus",
    "n_pasajeros": 35,
    "flota": "propio",
    "conductor": {
        "_id": "...",
        "full_name": "Carlos Conductor",
        "contact": { "phone": "3001234567" }
    },
    "conductor_phone": "3001234567",
    "nombre_cuenta_cobro": "Cuenta Cobro Febrero 2024",
    "valor_cancelado": 450000,
    "doc_soporte": "DOC-2024-001",
    "fecha_cancelado": "2024-02-20T00:00:00.000Z",
    "n_egreso": "EGR-001",
    "valor_a_facturar": 600000,
    "n_factura": "FAC-2024-0001",
    "fecha_factura": "2024-02-18T00:00:00.000Z",
    "utilidad": 150000,
    "porcentaje_utilidad": 25,
    "created": "2024-02-10T14:30:00.000Z",
    "created_by": { "_id": "...", "full_name": "Admin" },
    "status": "accepted",
    "service_status": "finished"
}
```

---

## Driver Documents (Documentos del Conductor)

### DriverDocuments (Interface)

```typescript
interface DriverDocuments {
    _id: string;                    // ID único
    driver_id: string;              // ID del conductor
    document: {
        front: MediaTypes;          // Foto frontal de la cédula
        back: MediaTypes;           // Foto trasera de la cédula
    };
    licencia_conduccion: {
        front: MediaTypes;          // Foto frontal de la licencia
        back: MediaTypes;           // Foto trasera de la licencia
    };
}
```

**Ejemplo:**
```json
{
    "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
    "driver_id": "64f8a1b2c3d4e5f6g7h8i9j1",
    "document": {
        "front": {
            "url": "https://res.cloudinary.com/.../cedula_front.jpg",
            "public_id": "cedula_front_123",
            "type": "img",
            "original_name": "cedula_frontal_1707912345678"
        },
        "back": {
            "url": "https://res.cloudinary.com/.../cedula_back.jpg",
            "public_id": "cedula_back_123",
            "type": "img",
            "original_name": "cedula_trasera_1707912345678"
        }
    },
    "licencia_conduccion": {
        "front": { ... },
        "back": { ... }
    }
}
```

---

## Vehicle Documents (Documentos del Vehículo)

### VehicleDocuments (Interface)

```typescript
interface VehicleDocuments {
    _id: string;                    // ID único
    vehicle_id: string;             // ID del vehículo
    soat: MediaTypes;               // SOAT
    tecnomecanica: MediaTypes;      // Certificado técnico-mecánico
    seguro: MediaTypes;             // Póliza de seguro
    licencia_transito: MediaTypes;  // Licencia de tránsito
    runt: MediaTypes;               // Certificado RUNT
}
```

---

## Vehicle Preoperational (Reporte Preoperacional)

### PreOpReportStatus

Estados del reporte preoperacional.

```typescript
type PreOpReportStatus = "ok" | "details" | "failures";
```

| Valor | Descripción |
|-------|-------------|
| `ok` | Todo en orden |
| `details` | Hay detalles a revisar |
| `failures` | Hay fallas que requieren atención |

---

### PreOpReport (Type)

Un item individual del reporte preoperacional.

```typescript
type PreOpReport = {
    media: MediaTypes[];            // Archivos multimedia (fotos/videos)
    description: string;            // Descripción del item revisado
    status: PreOpReportStatus;      // Estado del item
    uploaded: Date;                 // Fecha de carga
}
```

---

### VehiclePreoperational (Interface)

```typescript
interface VehiclePreoperational {
    _id: string;                    // ID único
    vehicle_id: string;             // ID del vehículo
    reports: PreOpReport[];         // Lista de items del reporte
    uploaded_by: string;            // ID del usuario que subió (conductor)
    created: Date;                  // Fecha de creación
}
```

**Ejemplo:**
```json
{
    "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
    "vehicle_id": "64f8a1b2c3d4e5f6g7h8i9j1",
    "reports": [
        {
            "media": [
                {
                    "url": "https://res.cloudinary.com/.../llanta1.jpg",
                    "public_id": "llanta1_123",
                    "type": "img",
                    "original_name": "llanta_delantera.jpg"
                }
            ],
            "description": "Estado de llantas delanteras",
            "status": "ok",
            "uploaded": "2024-02-15T06:30:00.000Z"
        },
        {
            "media": [
                {
                    "url": "https://res.cloudinary.com/.../aceite.jpg",
                    "public_id": "aceite_123",
                    "type": "img"
                }
            ],
            "description": "Nivel de aceite bajo",
            "status": "details",
            "uploaded": "2024-02-15T06:32:00.000Z"
        }
    ],
    "uploaded_by": "64f8a1b2c3d4e5f6g7h8i9j2",
    "created": "2024-02-15T06:30:00.000Z"
}
```

---

## Vehicle Operational (Gastos Operacionales)

### VehicleBillType

Tipos de gastos operacionales.

```typescript
type VehicleBillType = "fuel" | "tolls" | "repairs" | "fines" | "parking_lot";
```

| Valor | Descripción |
|-------|-------------|
| `fuel` | Combustible |
| `tolls` | Peajes |
| `repairs` | Reparaciones/Mantenimiento |
| `fines` | Multas |
| `parking_lot` | Parqueadero |

---

### VehicleBills (Type)

Un gasto operacional individual.

```typescript
type VehicleBills = {
    type_bill: VehicleBillType;     // Tipo de gasto
    value: number;                  // Valor en pesos
    description: string;            // Descripción del gasto
    media_support: MediaTypes[];    // Soportes (fotos de facturas, etc.)
    uploaded: Date;                 // Fecha de registro
}
```

---

### VehicleOperational (Interface)

```typescript
interface VehicleOperational {
    _id: string;                    // ID único
    vehicle_id: string;             // ID del vehículo
    bills: VehicleBills[];          // Lista de gastos
    uploaded_by: string;            // ID del usuario que registró
    created: Date;                  // Fecha de creación
}
```

**Ejemplo:**
```json
{
    "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
    "vehicle_id": "64f8a1b2c3d4e5f6g7h8i9j1",
    "bills": [
        {
            "type_bill": "fuel",
            "value": 150000,
            "description": "Tanqueo completo - Estación Terpel Km 5",
            "media_support": [
                {
                    "url": "https://res.cloudinary.com/.../factura_fuel.jpg",
                    "public_id": "factura_fuel_123",
                    "type": "img",
                    "original_name": "factura_combustible.jpg"
                }
            ],
            "uploaded": "2024-02-15T10:30:00.000Z"
        },
        {
            "type_bill": "tolls",
            "value": 45000,
            "description": "Peajes ruta Bogotá - Medellín (3 peajes)",
            "media_support": [
                {
                    "url": "https://res.cloudinary.com/.../peaje1.jpg",
                    "public_id": "peaje1_123",
                    "type": "img"
                },
                {
                    "url": "https://res.cloudinary.com/.../peaje2.jpg",
                    "public_id": "peaje2_123",
                    "type": "img"
                }
            ],
            "uploaded": "2024-02-15T14:45:00.000Z"
        }
    ],
    "uploaded_by": "64f8a1b2c3d4e5f6g7h8i9j2",
    "created": "2024-02-15T10:30:00.000Z"
}
```

---

## Services (Servicios)

### Services (Interface)

Catálogo de servicios disponibles.

```typescript
interface Services {
    _id: string;                    // ID único
    code: string;                   // Código del servicio
    name: string;                   // Nombre del servicio
    description: string;            // Descripción
    value: number;                  // Valor base
    company_id: string;             // ID de la compañía
}
```

---

## Tipos para Respuestas de Login

### LoginResponse (Users)

```typescript
interface LoginResponse {
    token: string;
    user: {
        full_name: string;
        avatar: string;             // URL del avatar
        role: UserRoles;
        company_id: string;
        company_name: string;
        company_logo: MediaTypes;
    }
}
```

### LoginResponse (Clients)

```typescript
interface ClientLoginResponse {
    token: string;
    client: {
        _id: string;
        name: string;
        contact_name: string;
        contact_phone: string;
        email: string;
        company_id: string;
        company_name: string;
        company_document: {
            type: UserDocuments;
            number: number;
            dv: string;
        }
    }
}
```

---

## Tipos para Paginación

### PaginationResponse

```typescript
interface PaginationResponse {
    current_page: number;           // Página actual
    total_pages: number;            // Total de páginas
    total_items: number;            // Total de elementos (varía según entidad)
    limit: number;                  // Elementos por página
    has_next_page: boolean;         // Si hay página siguiente
    has_prev_page: boolean;         // Si hay página anterior
}
```

**Nota:** El nombre de `total_items` varía según la entidad:
- `total_users` para usuarios
- `total_companies` para compañías
- `total_vehicles` para vehículos
- `total` para clientes y solicitudes

---

## Resumen de Enums/Types para Validación

```typescript
// Documentos de identidad
const USER_DOCUMENTS = ["cc", "ce", "psp", "ti", "nit"] as const;

// Roles de usuario
const USER_ROLES = ["superadmon", "admin", "coordinador", "contabilidad", "operador", "conductor", "cliente"] as const;

// Tipos de vehículo
const VEHICLE_TYPES = ["bus", "buseta", "buseton", "camioneta", "campero", "micro", "van"] as const;

// Tipos de flota
const VEHICLE_FLOTA = ["externo", "propio", "afiliado"] as const;

// Tipos de propietario
const OWNER_TYPES = ["Company", "User", "Both"] as const;

// Estados de solicitud
const SOLICITUD_STATUS = ["pending", "accepted", "rejected"] as const;

// Estados de servicio
const SERVICE_STATUS = ["not-started", "started", "finished"] as const;

// Tipos de empresa
const EMPRESA_TYPES = ["travel", "national"] as const;

// Estados de reporte preoperacional
const PREOP_STATUS = ["ok", "details", "failures"] as const;

// Tipos de gastos
const BILL_TYPES = ["fuel", "tolls", "repairs", "fines", "parking_lot"] as const;
```

---

## Archivo de Types para Frontend (TypeScript)

Puedes copiar y usar este archivo completo en tu proyecto frontend:

```typescript
// types/api.types.ts

// ==================== GLOBAL TYPES ====================

export type MediaTypes = {
    url: string;
    public_id: string;
    type: string;
    original_name?: string;
    file_extension?: string;
}

// ==================== USER TYPES ====================

export type UserDocuments = "cc" | "ce" | "psp" | "ti" | "nit";

export type UserRoles = "superadmon" | "admin" | "coordinador" | "contabilidad" | "operador" | "conductor" | "cliente";

export interface User {
    _id: string;
    full_name: string;
    document: {
        type: UserDocuments;
        number: number;
    };
    avatar: MediaTypes;
    role: UserRoles;
    contact: {
        email: string;
        phone: string;
        address: string;
    };
    email: string;
    company_id: string;
    created: Date | string;
    is_active: boolean;
    is_delete: boolean;
}

// ==================== COMPANY TYPES ====================

export interface Company {
    _id: string;
    company_name: string;
    document: {
        type: UserDocuments;
        number: number;
        dv: string;
    };
    simba_token?: string;
    fe_id_ref?: string;
    logo: MediaTypes;
    created: Date | string;
}

// ==================== CLIENT TYPES ====================

export interface Client {
    _id: string;
    company_id: string | Company;
    name: string;
    phone: string;
    contact_name: string;
    contact_phone: string;
    email: string;
    created: Date | string;
}

// ==================== VEHICLE TYPES ====================

export type VehicleTypes = "bus" | "buseta" | "buseton" | "camioneta" | "campero" | "micro" | "van";

export type VehicleFlota = "externo" | "propio" | "afiliado";

export type VehicleOwnerType = "Company" | "User" | "Both";

export interface Vehicle {
    _id: string;
    driver_id: string | User;
    placa: string;
    name?: string;
    description?: string;
    seats: number;
    flota: VehicleFlota;
    type: VehicleTypes;
    picture: MediaTypes;
    owner_id: {
        type: VehicleOwnerType;
        company_id: string | Company;
        user_id: string | User;
    };
    created: Date | string;
}

// ==================== SOLICITUD TYPES ====================

export type SolicitudStatus = "pending" | "accepted" | "rejected";

export type ServiceStatus = "not-started" | "started" | "finished";

export type EmpresaType = "travel" | "national";

export interface Bitacora {
    _id: string;
    company_id: string;
    year: string;
    month: string;
    created: Date | string;
}

export interface BitacoraSolicitud {
    _id: string;
    bitacora_id: string;
    he: string;
    empresa: EmpresaType;
    fecha: Date | string;
    hora_inicio: string;
    hora_final: string;
    total_horas: number;
    cliente: string | Client;
    contacto: string;
    origen: string;
    destino: string;
    novedades: string;
    vehiculo_id: string | Vehicle;
    placa: string;
    tipo_vehiculo: VehicleTypes;
    n_pasajeros: number;
    flota: VehicleFlota;
    conductor: string | User;
    conductor_phone: string;
    nombre_cuenta_cobro: string;
    valor_cancelado: number;
    doc_soporte: string;
    fecha_cancelado: Date | string;
    n_egreso: string;
    valor_a_facturar: number;
    n_factura: string;
    fecha_factura?: Date | string;
    utilidad: number;
    porcentaje_utilidad: number;
    created: Date | string;
    created_by?: string | User;
    status: SolicitudStatus;
    service_status: ServiceStatus;
}

// ==================== DOCUMENT TYPES ====================

export interface DriverDocuments {
    _id: string;
    driver_id: string;
    document: {
        front: MediaTypes;
        back: MediaTypes;
    };
    licencia_conduccion: {
        front: MediaTypes;
        back: MediaTypes;
    };
}

export interface VehicleDocuments {
    _id: string;
    vehicle_id: string;
    soat: MediaTypes;
    tecnomecanica: MediaTypes;
    seguro: MediaTypes;
    licencia_transito: MediaTypes;
    runt: MediaTypes;
}

// ==================== OPERATIONAL TYPES ====================

export type PreOpReportStatus = "ok" | "details" | "failures";

export type PreOpReport = {
    media: MediaTypes[];
    description: string;
    status: PreOpReportStatus;
    uploaded: Date | string;
}

export interface VehiclePreoperational {
    _id: string;
    vehicle_id: string;
    reports: PreOpReport[];
    uploaded_by: string;
    created: Date | string;
}

export type VehicleBillType = "fuel" | "tolls" | "repairs" | "fines" | "parking_lot";

export type VehicleBills = {
    type_bill: VehicleBillType;
    value: number;
    description: string;
    media_support: MediaTypes[];
    uploaded: Date | string;
}

export interface VehicleOperational {
    _id: string;
    vehicle_id: string;
    bills: VehicleBills[];
    uploaded_by: string;
    created: Date | string;
}

// ==================== RESPONSE TYPES ====================

export interface LoginResponse {
    token: string;
    user: {
        full_name: string;
        avatar: string;
        role: UserRoles;
        company_id: string;
        company_name: string;
        company_logo: MediaTypes;
    }
}

export interface ClientLoginResponse {
    token: string;
    client: {
        _id: string;
        name: string;
        contact_name: string;
        contact_phone: string;
        email: string;
        company_id: string;
        company_name: string;
        company_document: {
            type: UserDocuments;
            number: number;
            dv: string;
        }
    }
}

export interface PaginationInfo {
    current_page: number;
    total_pages: number;
    limit: number;
    has_next_page: boolean;
    has_prev_page: boolean;
}

export interface ApiResponse<T> {
    message: string;
    data?: T;
}

export interface ApiErrorResponse {
    ok: false;
    message: string;
}
```

