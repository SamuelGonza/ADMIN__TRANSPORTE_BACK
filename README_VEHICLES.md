# 🚗 Documentación de Endpoints de Vehículos

## Tabla de Contenidos

1. [Información General](#información-general)
2. [Autenticación](#autenticación)
3. [Tipos de Datos](#tipos-de-datos)
4. [Endpoints](#endpoints)
   - [Creación y Registro](#creación-y-registro)
   - [Consultas](#consultas)
   - [Actualización](#actualización)
   - [Documentos](#documentos)
   - [Reportes](#reportes)
   - [Gastos Operacionales](#gastos-operacionales)

---

## Información General

El módulo de vehículos permite gestionar toda la información relacionada con los vehículos de la flota de transporte, incluyendo:

- Información básica del vehículo (placa, tipo, capacidad, etc.)
- Asignación de conductores
- Propietarios (compañía o usuario)
- Documentos legales (SOAT, técnico-mecánica, seguro, etc.)
- Reportes preoperacionales y operacionales
- Gastos operacionales (combustible, peajes, reparaciones, etc.)
- Fichas técnicas

**Base URL:** `/api/v1/vehicles`

---

## Autenticación

Todos los endpoints requieren autenticación mediante cookie de sesión (`_session_token_`). Los permisos varían según el rol del usuario:

### Roles y Permisos

| Rol | Permisos |
|-----|----------|
| **admin** | Acceso completo (lectura y escritura) |
| **coordinador** | Lectura completa, escritura limitada (crear vehículos, actualizar documentos) |
| **comercial** | Lectura completa, escritura limitada (crear vehículos, actualizar documentos) |
| **operador** | Lectura completa, crear reportes preoperacionales y gastos operacionales |
| **conductor** | Lectura limitada, crear reportes preoperacionales |
| **Todos los usuarios autenticados** | Lectura básica (consultar vehículos) |

---

## Tipos de Datos

### VehicleTypes

Tipos de vehículos disponibles en el sistema:

```typescript
type VehicleTypes = "bus" | "buseta" | "buseton" | "camioneta" | "campero" | "micro" | "van"
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

### VehicleFlota

Tipos de pertenencia del vehículo a la flota:

```typescript
type VehicleFlota = "externo" | "propio" | "afiliado"
```

| Valor | Descripción |
|-------|-------------|
| `externo` | Vehículo externo/tercero |
| `propio` | Vehículo propio de la empresa |
| `afiliado` | Vehículo afiliado |

### VehicleOwnerType

Tipo de propietario del vehículo:

```typescript
type VehicleOwnerType = "Company" | "User" | "Both"
```

| Valor | Descripción |
|-------|-------------|
| `Company` | Propietario es una compañía |
| `User` | Propietario es una persona natural |
| `Both` | Propiedad compartida (compañía y persona) |

### Estructura del Vehículo

```typescript
interface Vehicle {
    _id: string;
    driver_id: ObjectId | User;
    possible_drivers?: ObjectId[];
    n_numero_interno?: string;
    placa: string;
    name?: string;
    description?: string;
    seats: number;
    flota: VehicleFlota;
    type: VehicleTypes;
    picture: MediaTypes;
    technical_sheet?: {
        licencia_transito_numero?: string;
        linea?: string;
        cilindrada_cc?: number;
        servicio?: string;
        carroceria?: string;
        capacidad_pasajeros?: number;
        capacidad_toneladas?: number;
        numero_chasis?: string;
        fecha_matricula?: Date;
        tarjeta_operacion_numero?: string;
        tarjeta_operacion_vencimiento?: Date;
        titular_licencia?: string;
        marca?: string;
        modelo?: number;
        color?: string;
        tipo_combustible?: string;
        numero_motor?: string;
        numero_serie?: string;
        declaracion_importacion?: string;
    };
    owner_id: {
        type: "Company" | "User";
        company_id: ObjectId;
        user_id: ObjectId;
    };
    created: Date;
}
```

---

## Endpoints

## Creación y Registro

### `POST /api/v1/vehicles`

Crea un nuevo vehículo en el sistema.

**Autenticación:** ✅ Requiere `admin`, `coordinador` o `comercial` (VehicleWriteAuth)

**Content-Type:** `multipart/form-data`

**Body (FormData):**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `company_id` | string | No* | ID de la compañía (opcional si el token ya trae company_id) |
| `driver_id` | string | ✅ Sí | ID del conductor asignado |
| `possible_drivers` | string[] | No | Array de IDs de conductores posibles |
| `n_numero_interno` | string | No | Número interno del vehículo |
| `placa` | string | ✅ Sí | Placa del vehículo (ej: "ABC123") |
| `name` | string | No | Nombre/alias del vehículo |
| `description` | string | No | Descripción del vehículo |
| `seats` | number | ✅ Sí | Número de asientos |
| `type` | VehicleTypes | ✅ Sí | Tipo de vehículo (bus, buseta, etc.) |
| `flota` | VehicleFlota | ✅ Sí | Tipo de flota (externo, propio, afiliado) |
| `owner_id` | object | ✅ Sí | Objeto con información del propietario |
| `owner_id.type` | string | ✅ Sí | Tipo: "Company" o "User" |
| `owner_id.company_id` | string | Condicional | ID de compañía (si type es "Company") |
| `owner_id.user_id` | string | Condicional | ID de usuario (si type es "User") |
| `technical_sheet` | object | No | Objeto JSON con ficha técnica |
| `picture` | File | No | Imagen del vehículo |

**Ejemplo de Request:**

```bash
curl -X POST "https://api.example.com/api/v1/vehicles" \
  -H "Cookie: _session_token_=..." \
  -F "driver_id=64f8a1b2c3d4e5f6g7h8i9j0" \
  -F "placa=ABC123" \
  -F "name=Bus Ejecutivo 1" \
  -F "seats=40" \
  -F "type=bus" \
  -F "flota=propio" \
  -F "owner_id={\"type\":\"Company\",\"company_id\":\"64f8a1b2c3d4e5f6g7h8i9j1\"}" \
  -F "picture=@/path/to/image.jpg"
```

**Respuesta Exitosa (201):**

```json
{
    "message": "Vehículo creado exitosamente"
}
```

**Errores Posibles:**

- `401`: No autorizado (token inválido o sin permisos)
- `400`: Datos inválidos (campos requeridos faltantes)
- `500`: Error del servidor

---

### `POST /api/v1/vehicles/preoperational`

Crea un reporte preoperacional del vehículo. Este reporte es ejecutado por el conductor antes de iniciar un servicio para verificar el estado del vehículo.

**Autenticación:** ✅ Requiere `operador` o `conductor` (OperadorAuth)

**Content-Type:** `multipart/form-data`

**Body (FormData):**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `vehicle_id` | string | ✅ Sí | ID del vehículo |
| `driver_id` | string | No* | ID del conductor (se ignora si el token es de conductor) |
| `reports` | string (JSON) o array | ✅ Sí | Array de reportes en formato JSON |
| `reports[0][media]` | File[] | No | Archivos multimedia del primer reporte |
| `reports[1][media]` | File[] | No | Archivos multimedia del segundo reporte |
| ... | ... | ... | ... |

**Estructura de `reports` (JSON):**

```json
[
    {
        "description": "Estado de llantas",
        "status": "ok"
    },
    {
        "description": "Nivel de aceite",
        "status": "details",
        "media": []
    },
    {
        "description": "Frenos con ruido",
        "status": "failures",
        "media": []
    }
]
```

**Estados válidos para `status`:**
- `ok`: Todo en orden
- `details`: Requiere atención pero no es crítico
- `failures`: Fallas detectadas

**Ejemplo de Request:**

```bash
curl -X POST "https://api.example.com/api/v1/vehicles/preoperational" \
  -H "Cookie: _session_token_=..." \
  -F "vehicle_id=64f8a1b2c3d4e5f6g7h8i9j0" \
  -F "reports=[{\"description\":\"Llantas\",\"status\":\"ok\"},{\"description\":\"Aceite\",\"status\":\"details\"}]" \
  -F "reports[0][media]=@/path/to/image1.jpg" \
  -F "reports[1][media]=@/path/to/image2.jpg"
```

**Respuesta Exitosa (201):**

```json
{
    "message": "Reporte preoperacional creado exitosamente"
}
```

**Nota:** Si hay fallas (`failures`) o detalles (`details`) que requieren revisión, se envía automáticamente un email a la empresa.

**Errores Posibles:**

- `401`: No autorizado
- `400`: Datos inválidos
- `404`: Vehículo no encontrado
- `500`: Error del servidor

---

### `POST /api/v1/vehicles/operational-bills`

Registra gastos operacionales del vehículo (combustible, peajes, reparaciones, multas, parqueaderos, etc.).

**Autenticación:** ✅ Requiere `operador` (OperadorAuth)

**Content-Type:** `multipart/form-data`

**Body (FormData):**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `vehicle_id` | string | ✅ Sí | ID del vehículo |
| `user_id` | string | No | ID del usuario que registra (opcional, se usa el usuario autenticado si no se proporciona) |
| `bills` | string (JSON) o array | ✅ Sí | Array de gastos en formato JSON |
| `bills[0][media_support]` | File[] | No | Soportes del primer gasto (facturas, recibos, etc.) |
| `bills[1][media_support]` | File[] | No | Soportes del segundo gasto |
| ... | ... | ... | ... |

**Estructura de `bills` (JSON):**

```json
[
    {
        "type_bill": "fuel",
        "value": 150000,
        "description": "Tanqueo completo estación Terpel",
        "media_support": []
    },
    {
        "type_bill": "tolls",
        "value": 45000,
        "description": "Peajes ruta Bogotá-Medellín",
        "media_support": []
    },
    {
        "type_bill": "repairs",
        "value": 200000,
        "description": "Cambio de aceite y filtros",
        "media_support": []
    }
]
```

**Tipos de gasto válidos (`type_bill`):**
- `fuel`: Combustible
- `tolls`: Peajes
- `repairs`: Reparaciones
- `fines`: Multas
- `parking_lot`: Parqueaderos

**Ejemplo de Request:**

```bash
curl -X POST "https://api.example.com/api/v1/vehicles/operational-bills" \
  -H "Cookie: _session_token_=..." \
  -F "vehicle_id=64f8a1b2c3d4e5f6g7h8i9j0" \
  -F "bills=[{\"type_bill\":\"fuel\",\"value\":150000,\"description\":\"Tanqueo\"}]" \
  -F "bills[0][media_support]=@/path/to/receipt.jpg"
```

**Respuesta Exitosa (201):**

```json
{
    "message": "Gastos operacionales registrados exitosamente"
}
```

**Errores Posibles:**

- `401`: No autorizado
- `400`: Datos inválidos
- `404`: Vehículo no encontrado
- `500`: Error del servidor

---

## Consultas

### `GET /api/v1/vehicles`

Obtiene la lista paginada de todos los vehículos del sistema.

**Autenticación:** ✅ Requiere sesión autenticada (SessionAuth)

**Query Parameters:**

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `page` | number | No | Número de página (default: 1) |
| `limit` | number | No | Vehículos por página (default: 10) |
| `placa` | string | No | Filtrar por placa (búsqueda parcial) |
| `type` | VehicleTypes | No | Filtrar por tipo de vehículo |
| `name` | string | No | Filtrar por nombre |

**Ejemplo de Request:**

```bash
curl -X GET "https://api.example.com/api/v1/vehicles?page=1&limit=10&type=bus" \
  -H "Cookie: _session_token_=..."
```

**Respuesta Exitosa (200):**

```json
{
    "message": "Vehículos obtenidos correctamente",
    "data": {
        "vehicles": [
            {
                "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
                "driver_id": {
                    "_id": "64f8a1b2c3d4e5f6g7h8i9j1",
                    "full_name": "Juan Pérez",
                    "contact": {
                        "phone": "3001234567"
                    }
                },
                "possible_drivers": [],
                "n_numero_interno": "001",
                "placa": "ABC123",
                "name": "Bus Ejecutivo 1",
                "description": "Bus con aire acondicionado",
                "seats": 40,
                "type": "bus",
                "flota": "propio",
                "picture": {
                    "url": "https://cloudinary.com/image.jpg",
                    "public_id": "vehicles/abc123",
                    "type": "img"
                },
                "technical_sheet": {
                    "marca": "Mercedes-Benz",
                    "modelo": 2020,
                    "color": "Blanco"
                },
                "owner_id": {
                    "type": "Company",
                    "company_id": {
                        "_id": "64f8a1b2c3d4e5f6g7h8i9j2",
                        "company_name": "Transportes ABC S.A.S"
                    },
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

**Errores Posibles:**

- `401`: No autorizado
- `500`: Error del servidor

---

### `GET /api/v1/vehicles/company`

### `GET /api/v1/vehicles/company/:company_id`

Obtiene los vehículos de una compañía específica.

**Autenticación:** ✅ Requiere sesión autenticada (SessionAuth)

**URL Parameters (solo para la segunda ruta):**

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `company_id` | string | Sí* | ID de la compañía (requerido en path, opcional en query) |

**Query Parameters:**

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `company_id` | string | No* | ID de la compañía (opcional si el token tiene company_id o se usa path param) |
| `page` | number | No | Número de página (default: 1) |
| `limit` | number | No | Vehículos por página (default: 10) |
| `placa` | string | No | Filtrar por placa |
| `type` | VehicleTypes | No | Filtrar por tipo |
| `name` | string | No | Filtrar por nombre |

**Ejemplo de Request:**

```bash
# Usando query parameter
curl -X GET "https://api.example.com/api/v1/vehicles/company?company_id=64f8a1b2c3d4e5f6g7h8i9j2&page=1" \
  -H "Cookie: _session_token_=..."

# Usando path parameter
curl -X GET "https://api.example.com/api/v1/vehicles/company/64f8a1b2c3d4e5f6g7h8i9j2?page=1" \
  -H "Cookie: _session_token_=..."
```

**Respuesta:** Igual estructura que `GET /api/v1/vehicles`

---

### `GET /api/v1/vehicles/last-reports`

### `GET /api/v1/vehicles/last-reports/:company_id`

Obtiene todos los vehículos con sus últimos reportes (operacional y preoperacional).

**Autenticación:** ✅ Requiere sesión autenticada (SessionAuth)

**URL Parameters (solo para la segunda ruta):**

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `company_id` | string | Sí* | ID de la compañía |

**Query Parameters:**

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `company_id` | string | No* | ID de la compañía (opcional si el token tiene company_id o se usa path param) |
| `page` | number | No | Número de página (default: 1) |
| `limit` | number | No | Vehículos por página (default: 10) |

**Ejemplo de Request:**

```bash
curl -X GET "https://api.example.com/api/v1/vehicles/last-reports?company_id=64f8a1b2c3d4e5f6g7h8i9j2&page=1&limit=10" \
  -H "Cookie: _session_token_=..."
```

**Respuesta Exitosa (200):**

```json
{
    "message": "Vehículos con últimos reportes obtenidos correctamente",
    "data": {
        "vehicles": [
            {
                "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
                "placa": "ABC123",
                "name": "Bus Ejecutivo 1",
                "last_operational": {
                    "_id": "...",
                    "created": "2024-01-20T08:00:00.000Z",
                    "bills": [...]
                },
                "last_preoperational": {
                    "_id": "...",
                    "created": "2024-01-20T07:30:00.000Z",
                    "reports": [...]
                }
            }
        ],
        "pagination": {
            "current_page": 1,
            "total_pages": 2,
            "total_vehicles": 15,
            "limit": 10
        }
    }
}
```

---

### `GET /api/v1/vehicles/user/:user_id`

Obtiene los vehículos asignados a un usuario (propietario).

**Autenticación:** ✅ Requiere sesión autenticada (SessionAuth)

**URL Parameters:**

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `user_id` | string | ✅ Sí | ID del usuario propietario |

**Ejemplo de Request:**

```bash
curl -X GET "https://api.example.com/api/v1/vehicles/user/64f8a1b2c3d4e5f6g7h8i9j1" \
  -H "Cookie: _session_token_=..."
```

**Respuesta Exitosa (200):**

```json
{
    "message": "Vehículos del usuario obtenidos correctamente",
    "data": [
        {
            "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
            "placa": "ABC123",
            "name": "Bus Ejecutivo 1",
            "type": "bus",
            "flota": "propio",
            "owner_id": {
                "type": "User",
                "user_id": {
                    "_id": "64f8a1b2c3d4e5f6g7h8i9j1",
                    "full_name": "Juan Pérez"
                }
            }
        }
    ]
}
```

---

### `GET /api/v1/vehicles/:id`

Obtiene el detalle completo de un vehículo específico.

**Autenticación:** ✅ Requiere sesión autenticada (SessionAuth)

**URL Parameters:**

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `id` | string | ✅ Sí | ID del vehículo |

**Ejemplo de Request:**

```bash
curl -X GET "https://api.example.com/api/v1/vehicles/64f8a1b2c3d4e5f6g7h8i9j0" \
  -H "Cookie: _session_token_=..."
```

**Respuesta Exitosa (200):**

```json
{
    "message": "Vehículo obtenido correctamente",
    "data": {
        "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
        "driver_id": {
            "_id": "64f8a1b2c3d4e5f6g7h8i9j1",
            "full_name": "Juan Pérez",
            "contact": {
                "phone": "3001234567",
                "email": "juan@example.com"
            }
        },
        "possible_drivers": [],
        "n_numero_interno": "001",
        "placa": "ABC123",
        "name": "Bus Ejecutivo 1",
        "description": "Bus con aire acondicionado y WiFi",
        "seats": 40,
        "type": "bus",
        "flota": "propio",
        "picture": {
            "url": "https://cloudinary.com/image.jpg",
            "public_id": "vehicles/abc123",
            "type": "img"
        },
        "technical_sheet": {
            "licencia_transito_numero": "LT-123456",
            "linea": "Mercedes-Benz",
            "marca": "Mercedes-Benz",
            "modelo": 2020,
            "color": "Blanco",
            "cilindrada_cc": 5000,
            "tipo_combustible": "Diesel",
            "numero_motor": "ENG-123456",
            "numero_chasis": "CHS-123456",
            "capacidad_pasajeros": 40,
            "fecha_matricula": "2020-01-15T00:00:00.000Z",
            "tarjeta_operacion_numero": "TO-123456",
            "tarjeta_operacion_vencimiento": "2025-01-15T00:00:00.000Z"
        },
        "owner_id": {
            "type": "Company",
            "company_id": {
                "_id": "64f8a1b2c3d4e5f6g7h8i9j2",
                "company_name": "Transportes ABC S.A.S"
            },
            "user_id": null
        },
        "created": "2024-01-15T10:30:00.000Z"
    }
}
```

**Errores Posibles:**

- `401`: No autorizado
- `404`: Vehículo no encontrado
- `500`: Error del servidor

---

### `GET /api/v1/vehicles/:id/technical-sheet-pdf`

Descarga la ficha técnica del vehículo en formato PDF.

**Autenticación:** ✅ Requiere sesión autenticada (SessionAuth)

**URL Parameters:**

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `id` | string | ✅ Sí | ID del vehículo |

**Ejemplo de Request:**

```bash
curl -X GET "https://api.example.com/api/v1/vehicles/64f8a1b2c3d4e5f6g7h8i9j0/technical-sheet-pdf" \
  -H "Cookie: _session_token_=..." \
  --output ficha_tecnica.pdf
```

**Respuesta Exitosa (200):**

- **Content-Type:** `application/pdf`
- **Content-Disposition:** `attachment; filename="ficha_tecnica_ABC123.pdf"`
- **Body:** Archivo PDF binario

**Errores Posibles:**

- `401`: No autorizado
- `404`: Vehículo no encontrado
- `500`: Error al generar PDF

---

## Actualización

### `PUT /api/v1/vehicles/:id`

Actualiza la información general de un vehículo.

**Autenticación:** ✅ Requiere `admin`, `coordinador` o `comercial` (VehicleWriteAuth)

**Content-Type:** `application/json`

**URL Parameters:**

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `id` | string | ✅ Sí | ID del vehículo |

**Body (JSON):**

Todos los campos son opcionales. Solo se actualizan los campos proporcionados.

```json
{
    "name": "Bus Ejecutivo 1 - Actualizado",
    "description": "Nueva descripción del vehículo",
    "seats": 42,
    "type": "buseton",
    "flota": "afiliado",
    "n_numero_interno": "002",
    "possible_drivers": ["64f8a1b2c3d4e5f6g7h8i9j1", "64f8a1b2c3d4e5f6g7h8i9j2"],
    "technical_sheet": {
        "marca": "Mercedes-Benz",
        "modelo": 2021,
        "color": "Azul"
    }
}
```

**Ejemplo de Request:**

```bash
curl -X PUT "https://api.example.com/api/v1/vehicles/64f8a1b2c3d4e5f6g7h8i9j0" \
  -H "Cookie: _session_token_=..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Bus Ejecutivo 1 - Actualizado",
    "seats": 42
  }'
```

**Respuesta Exitosa (200):**

```json
{
    "message": "Vehículo actualizado exitosamente"
}
```

**Errores Posibles:**

- `401`: No autorizado
- `400`: Datos inválidos
- `404`: Vehículo no encontrado
- `500`: Error del servidor

---

### `PUT /api/v1/vehicles/:id/picture`

Actualiza la imagen del vehículo.

**Autenticación:** ✅ Requiere `admin`, `coordinador` o `comercial` (VehicleWriteAuth)

**Content-Type:** `multipart/form-data`

**URL Parameters:**

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `id` | string | ✅ Sí | ID del vehículo |

**Body (FormData):**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `picture` | File | ✅ Sí | Nueva imagen del vehículo |

**Ejemplo de Request:**

```bash
curl -X PUT "https://api.example.com/api/v1/vehicles/64f8a1b2c3d4e5f6g7h8i9j0/picture" \
  -H "Cookie: _session_token_=..." \
  -F "picture=@/path/to/new_image.jpg"
```

**Respuesta Exitosa (200):**

```json
{
    "message": "Imagen del vehículo actualizada"
}
```

**Errores Posibles:**

- `401`: No autorizado
- `400`: No se proporcionó imagen
- `404`: Vehículo no encontrado
- `500`: Error del servidor

---

### `PUT /api/v1/vehicles/:id/owner`

Actualiza el propietario del vehículo.

**Autenticación:** ✅ Requiere `admin`, `coordinador` o `comercial` (VehicleWriteAuth)

**Content-Type:** `application/json`

**URL Parameters:**

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `id` | string | ✅ Sí | ID del vehículo |

**Body (JSON):**

```json
{
    "owner_id": {
        "type": "Company",
        "company_id": "64f8a1b2c3d4e5f6g7h8i9j2",
        "user_id": null
    }
}
```

O para propiedad compartida:

```json
{
    "owner_id": {
        "type": "Both",
        "company_id": "64f8a1b2c3d4e5f6g7h8i9j2",
        "user_id": "64f8a1b2c3d4e5f6g7h8i9j1"
    }
}
```

**Ejemplo de Request:**

```bash
curl -X PUT "https://api.example.com/api/v1/vehicles/64f8a1b2c3d4e5f6g7h8i9j0/owner" \
  -H "Cookie: _session_token_=..." \
  -H "Content-Type: application/json" \
  -d '{
    "owner_id": {
        "type": "Company",
        "company_id": "64f8a1b2c3d4e5f6g7h8i9j2"
    }
  }'
```

**Respuesta Exitosa (200):**

```json
{
    "message": "Propietario del vehículo actualizado"
}
```

**Errores Posibles:**

- `401`: No autorizado
- `400`: Datos inválidos
- `404`: Vehículo, compañía o usuario no encontrado
- `500`: Error del servidor

---

### `PUT /api/v1/vehicles/:id/driver`

Actualiza el conductor asignado al vehículo.

**Autenticación:** ✅ Requiere `admin`, `coordinador` o `comercial` (VehicleWriteAuth)

**Content-Type:** `application/json`

**URL Parameters:**

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `id` | string | ✅ Sí | ID del vehículo |

**Body (JSON):**

```json
{
    "driver_id": "64f8a1b2c3d4e5f6g7h8i9j1"
}
```

**Ejemplo de Request:**

```bash
curl -X PUT "https://api.example.com/api/v1/vehicles/64f8a1b2c3d4e5f6g7h8i9j0/driver" \
  -H "Cookie: _session_token_=..." \
  -H "Content-Type: application/json" \
  -d '{
    "driver_id": "64f8a1b2c3d4e5f6g7h8i9j1"
  }'
```

**Respuesta Exitosa (200):**

```json
{
    "message": "Conductor del vehículo actualizado"
}
```

**Errores Posibles:**

- `401`: No autorizado
- `400`: Datos inválidos
- `404`: Vehículo o conductor no encontrado
- `500`: Error del servidor

---

## Documentos

### `GET /api/v1/vehicles/:vehicle_id/documents`

Obtiene los documentos legales del vehículo (SOAT, técnico-mecánica, seguro, licencia de tránsito, RUNT).

**Autenticación:** ✅ Requiere sesión autenticada (SessionAuth)

**URL Parameters:**

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `vehicle_id` | string | ✅ Sí | ID del vehículo |

**Ejemplo de Request:**

```bash
curl -X GET "https://api.example.com/api/v1/vehicles/64f8a1b2c3d4e5f6g7h8i9j0/documents" \
  -H "Cookie: _session_token_=..."
```

**Respuesta Exitosa (200):**

```json
{
    "message": "Documentos del vehículo obtenidos correctamente",
    "data": {
        "soat": {
            "url": "https://cloudinary.com/soat.pdf",
            "public_id": "documents/soat_abc123",
            "type": "pdf",
            "vencimiento": "2025-06-15T00:00:00.000Z"
        },
        "tecnomecanica": {
            "url": "https://cloudinary.com/tecnomecanica.pdf",
            "public_id": "documents/tecnomecanica_abc123",
            "type": "pdf",
            "vencimiento": "2025-03-20T00:00:00.000Z"
        },
        "seguro": {
            "url": "https://cloudinary.com/seguro.pdf",
            "public_id": "documents/seguro_abc123",
            "type": "pdf",
            "vencimiento": "2025-12-31T00:00:00.000Z"
        },
        "licencia_transito": {
            "url": "https://cloudinary.com/licencia.pdf",
            "public_id": "documents/licencia_abc123",
            "type": "pdf"
        },
        "runt": {
            "url": "https://cloudinary.com/runt.pdf",
            "public_id": "documents/runt_abc123",
            "type": "pdf"
        },
        "tarjeta_operacion_vencimiento": "2025-01-15T00:00:00.000Z"
    }
}
```

**Errores Posibles:**

- `401`: No autorizado
- `404`: Vehículo no encontrado
- `500`: Error del servidor

---

### `PUT /api/v1/vehicles/:vehicle_id/documents`

Actualiza los documentos legales del vehículo y sus fechas de vencimiento.

**Autenticación:** ✅ Requiere `admin`, `coordinador` o `comercial` (VehicleWriteAuth)

**Content-Type:** `multipart/form-data`

**URL Parameters:**

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `vehicle_id` | string | ✅ Sí | ID del vehículo |

**Body (FormData):**

Todos los campos son opcionales. Solo se actualizan los documentos proporcionados.

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `soat` | File | No | Archivo PDF del SOAT |
| `tecnomecanica` | File | No | Archivo PDF de la técnico-mecánica |
| `seguro` | File | No | Archivo PDF del seguro |
| `licencia_transito` | File | No | Archivo PDF de la licencia de tránsito |
| `runt` | File | No | Archivo PDF del RUNT |
| `soat_vencimiento` | string (ISO date) | No | Fecha de vencimiento del SOAT |
| `tecnomecanica_vencimiento` | string (ISO date) | No | Fecha de vencimiento de la técnico-mecánica |
| `seguro_vencimiento` | string (ISO date) | No | Fecha de vencimiento del seguro |
| `tarjeta_operacion_vencimiento` | string (ISO date) | No | Fecha de vencimiento de la tarjeta de operación |

**Ejemplo de Request:**

```bash
curl -X PUT "https://api.example.com/api/v1/vehicles/64f8a1b2c3d4e5f6g7h8i9j0/documents" \
  -H "Cookie: _session_token_=..." \
  -F "soat=@/path/to/soat.pdf" \
  -F "soat_vencimiento=2025-06-15T00:00:00.000Z" \
  -F "tecnomecanica=@/path/to/tecnomecanica.pdf" \
  -F "tecnomecanica_vencimiento=2025-03-20T00:00:00.000Z"
```

**Respuesta Exitosa (200):**

```json
{
    "message": "Documentos del vehículo actualizados correctamente"
}
```

**Errores Posibles:**

- `401`: No autorizado
- `400`: Datos inválidos
- `404`: Vehículo no encontrado
- `500`: Error del servidor

---

## Reportes

### `GET /api/v1/vehicles/:vehicle_id/operationals`

Obtiene el historial paginado de registros operacionales (gastos) de un vehículo.

**Autenticación:** ✅ Requiere sesión autenticada (SessionAuth)

**URL Parameters:**

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `vehicle_id` | string | ✅ Sí | ID del vehículo |

**Query Parameters:**

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `page` | number | No | Número de página (default: 1) |
| `limit` | number | No | Registros por página (default: 10) |

**Ejemplo de Request:**

```bash
curl -X GET "https://api.example.com/api/v1/vehicles/64f8a1b2c3d4e5f6g7h8i9j0/operationals?page=1&limit=10" \
  -H "Cookie: _session_token_=..."
```

**Respuesta Exitosa (200):**

```json
{
    "message": "Registros operacionales del vehículo obtenidos correctamente",
    "data": {
        "operationals": [
            {
                "_id": "64f8a1b2c3d4e5f6g7h8i9j3",
                "vehicle_id": {
                    "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
                    "placa": "ABC123"
                },
                "user_id": {
                    "_id": "64f8a1b2c3d4e5f6g7h8i9j1",
                    "full_name": "Juan Pérez"
                },
                "bills": [
                    {
                        "type_bill": "fuel",
                        "value": 150000,
                        "description": "Tanqueo completo",
                        "media_support": [
                            {
                                "url": "https://cloudinary.com/receipt.jpg",
                                "type": "img"
                            }
                        ]
                    }
                ],
                "created": "2024-01-20T08:00:00.000Z"
            }
        ],
        "pagination": {
            "current_page": 1,
            "total_pages": 5,
            "total_operationals": 48,
            "limit": 10,
            "has_next_page": true,
            "has_prev_page": false
        }
    }
}
```

---

### `GET /api/v1/vehicles/:vehicle_id/preoperationals`

Obtiene el historial paginado de reportes preoperacionales de un vehículo.

**Autenticación:** ✅ Requiere sesión autenticada (SessionAuth)

**URL Parameters:**

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `vehicle_id` | string | ✅ Sí | ID del vehículo |

**Query Parameters:**

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `page` | number | No | Número de página (default: 1) |
| `limit` | number | No | Registros por página (default: 10) |

**Ejemplo de Request:**

```bash
curl -X GET "https://api.example.com/api/v1/vehicles/64f8a1b2c3d4e5f6g7h8i9j0/preoperationals?page=1&limit=10" \
  -H "Cookie: _session_token_=..."
```

**Respuesta Exitosa (200):**

```json
{
    "message": "Reportes preoperacionales del vehículo obtenidos correctamente",
    "data": {
        "preoperationals": [
            {
                "_id": "64f8a1b2c3d4e5f6g7h8i9j4",
                "vehicle_id": {
                    "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
                    "placa": "ABC123"
                },
                "driver_id": {
                    "_id": "64f8a1b2c3d4e5f6g7h8i9j1",
                    "full_name": "Juan Pérez"
                },
                "reports": [
                    {
                        "description": "Estado de llantas",
                        "status": "ok",
                        "media": []
                    },
                    {
                        "description": "Nivel de aceite",
                        "status": "details",
                        "media": [
                            {
                                "url": "https://cloudinary.com/oil.jpg",
                                "type": "img"
                            }
                        ]
                    }
                ],
                "created": "2024-01-20T07:30:00.000Z"
            }
        ],
        "pagination": {
            "current_page": 1,
            "total_pages": 3,
            "total_preoperationals": 25,
            "limit": 10,
            "has_next_page": true,
            "has_prev_page": false
        }
    }
}
```

---

### `GET /api/v1/vehicles/:vehicle_id/last-operational`

Obtiene el último registro operacional de un vehículo.

**Autenticación:** ✅ Requiere sesión autenticada (SessionAuth)

**URL Parameters:**

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `vehicle_id` | string | ✅ Sí | ID del vehículo |

**Ejemplo de Request:**

```bash
curl -X GET "https://api.example.com/api/v1/vehicles/64f8a1b2c3d4e5f6g7h8i9j0/last-operational" \
  -H "Cookie: _session_token_=..."
```

**Respuesta Exitosa (200):**

```json
{
    "message": "Último registro operacional obtenido correctamente",
    "data": {
        "_id": "64f8a1b2c3d4e5f6g7h8i9j3",
        "vehicle_id": {
            "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
            "placa": "ABC123"
        },
        "user_id": {
            "_id": "64f8a1b2c3d4e5f6g7h8i9j1",
            "full_name": "Juan Pérez"
        },
        "bills": [
            {
                "type_bill": "fuel",
                "value": 150000,
                "description": "Tanqueo completo",
                "media_support": []
            }
        ],
        "created": "2024-01-20T08:00:00.000Z"
    }
}
```

**Si no hay registros:**

```json
{
    "message": "Último registro operacional obtenido correctamente",
    "data": null
}
```

---

### `GET /api/v1/vehicles/:vehicle_id/last-preoperational`

Obtiene el último reporte preoperacional de un vehículo.

**Autenticación:** ✅ Requiere sesión autenticada (SessionAuth)

**URL Parameters:**

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `vehicle_id` | string | ✅ Sí | ID del vehículo |

**Ejemplo de Request:**

```bash
curl -X GET "https://api.example.com/api/v1/vehicles/64f8a1b2c3d4e5f6g7h8i9j0/last-preoperational" \
  -H "Cookie: _session_token_=..."
```

**Respuesta Exitosa (200):**

```json
{
    "message": "Último reporte preoperacional obtenido correctamente",
    "data": {
        "_id": "64f8a1b2c3d4e5f6g7h8i9j4",
        "vehicle_id": {
            "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
            "placa": "ABC123"
        },
        "driver_id": {
            "_id": "64f8a1b2c3d4e5f6g7h8i9j1",
            "full_name": "Juan Pérez"
        },
        "reports": [
            {
                "description": "Estado de llantas",
                "status": "ok",
                "media": []
            }
        ],
        "created": "2024-01-20T07:30:00.000Z"
    }
}
```

**Si no hay reportes:**

```json
{
    "message": "Último reporte preoperacional obtenido correctamente",
    "data": null
}
```

---

## Códigos de Estado HTTP

| Código | Descripción |
|--------|-------------|
| `200` | Operación exitosa |
| `201` | Recurso creado exitosamente |
| `400` | Solicitud inválida (datos faltantes o incorrectos) |
| `401` | No autorizado (token inválido o sin permisos) |
| `404` | Recurso no encontrado |
| `500` | Error interno del servidor |

---

## Notas Adicionales

### Formato de Fechas

Todas las fechas se manejan en formato ISO 8601:
- `2024-01-15T10:30:00.000Z`
- `2024-01-15` (solo fecha)

### Paginación

Todos los endpoints que retornan listas paginadas siguen esta estructura:

```json
{
    "pagination": {
        "current_page": 1,
        "total_pages": 3,
        "total_items": 25,
        "limit": 10,
        "has_next_page": true,
        "has_prev_page": false
    }
}
```

### Archivos Multimedia

Los archivos se almacenan en Cloudinary y se retornan con esta estructura:

```json
{
    "url": "https://cloudinary.com/image.jpg",
    "public_id": "vehicles/abc123",
    "type": "img" // o "pdf", "doc", etc.
}
```

### Tipos de Archivo Permitidos

- **Imágenes:** JPG, JPEG, PNG, GIF, WebP
- **Documentos:** PDF, DOC, DOCX

### Manejo de Errores

Todas las respuestas de error siguen este formato:

```json
{
    "ok": false,
    "message": "Descripción del error"
}
```

---

## Ejemplos de Uso Completo

### Flujo Completo: Crear Vehículo y Registrar Reportes

```bash
# 1. Crear vehículo
curl -X POST "https://api.example.com/api/v1/vehicles" \
  -H "Cookie: _session_token_=..." \
  -F "driver_id=64f8a1b2c3d4e5f6g7h8i9j1" \
  -F "placa=ABC123" \
  -F "name=Bus Ejecutivo 1" \
  -F "seats=40" \
  -F "type=bus" \
  -F "flota=propio" \
  -F "owner_id={\"type\":\"Company\",\"company_id\":\"64f8a1b2c3d4e5f6g7h8i9j2\"}" \
  -F "picture=@/path/to/image.jpg"

# 2. Crear reporte preoperacional
curl -X POST "https://api.example.com/api/v1/vehicles/preoperational" \
  -H "Cookie: _session_token_=..." \
  -F "vehicle_id=64f8a1b2c3d4e5f6g7h8i9j0" \
  -F "reports=[{\"description\":\"Llantas\",\"status\":\"ok\"}]"

# 3. Registrar gastos operacionales
curl -X POST "https://api.example.com/api/v1/vehicles/operational-bills" \
  -H "Cookie: _session_token_=..." \
  -F "vehicle_id=64f8a1b2c3d4e5f6g7h8i9j0" \
  -F "bills=[{\"type_bill\":\"fuel\",\"value\":150000,\"description\":\"Tanqueo\"}]"

# 4. Consultar vehículo con últimos reportes
curl -X GET "https://api.example.com/api/v1/vehicles/last-reports?company_id=64f8a1b2c3d4e5f6g7h8i9j2" \
  -H "Cookie: _session_token_=..."

# 5. Actualizar documentos
curl -X PUT "https://api.example.com/api/v1/vehicles/64f8a1b2c3d4e5f6g7h8i9j0/documents" \
  -H "Cookie: _session_token_=..." \
  -F "soat=@/path/to/soat.pdf" \
  -F "soat_vencimiento=2025-06-15T00:00:00.000Z"
```

---

## Contacto y Soporte

Para más información sobre la API, consulta la documentación principal o contacta al equipo de desarrollo.

---

**Última actualización:** Enero 2024

