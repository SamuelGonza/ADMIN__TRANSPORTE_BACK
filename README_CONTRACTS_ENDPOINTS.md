# 📋 Documentación de Endpoints de Contratos

Esta documentación describe todos los endpoints disponibles para gestionar contratos de clientes en el sistema.

---

## 📌 Información General

**Base URL:** `/api/v1/contracts`

**Autenticación:** Todos los endpoints requieren autenticación mediante cookie de sesión (`_session_token_`)

**Roles Permitidos:** 
- `coordinador`
- `comercia`
- `operador`
- `contabilidad`
- `admin`
- `superadmon`

*(Todos los endpoints usan el middleware `GestionAuth`)*

---

## 📚 Índice

1. [Crear Contrato](#1-crear-contrato)
2. [Obtener Contrato por ID](#2-obtener-contrato-por-id)
3. [Listar Contratos de un Cliente](#3-listar-contratos-de-un-cliente)
4. [Actualizar Contrato](#4-actualizar-contrato)
5. [Aplicar Cargo a Contrato](#5-aplicar-cargo-a-contrato)
6. [Consultar Contrato desde una Solicitud](#6-consultar-contrato-desde-una-solicitud)
7. [Tipos de Datos](#7-tipos-de-datos)
8. [Códigos de Estado HTTP](#8-códigos-de-estado-http)

---

## 1. Crear Contrato

### `POST /api/v1/contracts`

**Descripción:** Crea un nuevo contrato para un cliente. El contrato puede ser de tipo "fijo" (con presupuesto) o "ocasional" (sin presupuesto).

**Autenticación:** ✅ Requiere `coordinador`, `comercia`, `operador`, `contabilidad`, `admin` o `superadmon`

**Body (JSON):**

```json
{
  "client_id": "64f8a1b2c3d4e5f6g7h8i9j0",
  "tipo_contrato": "fijo",
  "periodo_presupuesto": "anio",
  "valor_presupuesto": 50000000,
  "cobro": {
    "modo_default": "por_hora",
    "por_hora": 50000,
    "por_kilometro": 2000,
    "por_distancia": 150000,
    "tarifa_amva": 200000
  },
  "notes": "Contrato anual para servicios corporativos"
}
```

**Parámetros del Body:**

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `client_id` | string | ✅ Sí | ID del cliente |
| `tipo_contrato` | string | ✅ Sí | Tipo de contrato: `"fijo"` o `"ocasional"` |
| `periodo_presupuesto` | string | ⚠️ Condicional | Requerido si `tipo_contrato = "fijo"`. Valores: `"anio"`, `"mes"`, `"semana"`, `"dia"` |
| `valor_presupuesto` | number | ⚠️ Condicional | Requerido si `tipo_contrato = "fijo"`. Valor del presupuesto en COP |
| `cobro` | object | ❌ No | Objeto con las tarifas de cobro |
| `cobro.modo_default` | string | ❌ No | Modo de cobro por defecto: `"por_hora"`, `"por_kilometro"`, `"por_distancia"`, `"tarifa_amva"` |
| `cobro.por_hora` | number | ❌ No | Tarifa por hora en COP |
| `cobro.por_kilometro` | number | ❌ No | Tarifa por kilómetro en COP |
| `cobro.por_distancia` | number | ❌ No | Tarifa fija por trayecto en COP |
| `cobro.tarifa_amva` | number | ❌ No | Tarifa AMVA en COP |
| `notes` | string | ❌ No | Notas adicionales sobre el contrato |
| `company_id` | string | ❌ No | ID de la compañía (se toma del token si no se proporciona) |

**Ejemplo de Request (Contrato Fijo):**

```bash
curl -X POST "https://api.example.com/api/v1/contracts" \
  -H "Content-Type: application/json" \
  -H "Cookie: _session_token_=..." \
  -d '{
    "client_id": "64f8a1b2c3d4e5f6g7h8i9j0",
    "tipo_contrato": "fijo",
    "periodo_presupuesto": "anio",
    "valor_presupuesto": 50000000,
    "cobro": {
      "modo_default": "por_hora",
      "por_hora": 50000,
      "por_kilometro": 2000
    },
    "notes": "Contrato anual 2024"
  }'
```

**Ejemplo de Request (Contrato Ocasional):**

```bash
curl -X POST "https://api.example.com/api/v1/contracts" \
  -H "Content-Type: application/json" \
  -H "Cookie: _session_token_=..." \
  -d '{
    "client_id": "64f8a1b2c3d4e5f6g7h8i9j0",
    "tipo_contrato": "ocasional",
    "cobro": {
      "modo_default": "por_kilometro",
      "por_kilometro": 2000
    }
  }'
```

**Respuesta Exitosa (201):**

```json
{
  "message": "Contrato creado exitosamente",
  "data": {
    "_id": "64f8a1b2c3d4e5f6g7h8i9j1",
    "company_id": {
      "_id": "64f8a1b2c3d4e5f6g7h8i9j2",
      "company_name": "Transportes ABC S.A.S",
      "logo": { ... }
    },
    "client_id": {
      "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
      "name": "Empresa Cliente S.A.S",
      "contact_name": "Juan Pérez",
      "contact_phone": "3001234567",
      "email": "contacto@empresacliente.com"
    },
    "tipo_contrato": "fijo",
    "periodo_presupuesto": "anio",
    "valor_presupuesto": 50000000,
    "valor_consumido": 0,
    "cobro": {
      "modo_default": "por_hora",
      "por_hora": 50000,
      "por_kilometro": 2000,
      "por_distancia": 150000,
      "tarifa_amva": 200000
    },
    "historico": [
      {
        "type": "budget_set",
        "created": "2024-01-15T10:30:00.000Z",
        "created_by": "64f8a1b2c3d4e5f6g7h8i9j3",
        "notes": "Creación de contrato",
        "prev_valor_presupuesto": null,
        "new_valor_presupuesto": 50000000,
        "prev_valor_consumido": 0,
        "new_valor_consumido": 0
      }
    ],
    "is_active": true,
    "created": "2024-01-15T10:30:00.000Z",
    "created_by": {
      "_id": "64f8a1b2c3d4e5f6g7h8i9j3",
      "full_name": "María González",
      "email": "maria@transportesabc.com",
      "role": "coordinador"
    }
  }
}
```

**Errores Posibles:**

- **400 Bad Request:** `"valor_presupuesto es requerido para contrato fijo"` - Si se crea un contrato fijo sin presupuesto
- **400 Bad Request:** `"periodo_presupuesto es requerido para contrato fijo"` - Si se crea un contrato fijo sin período
- **401 Unauthorized:** `"El cliente no pertenece a tu empresa"` - Si el cliente no pertenece a la compañía del usuario
- **404 Not Found:** `"Cliente no encontrado"` - Si el `client_id` no existe

---

## 2. Obtener Contrato por ID

### `GET /api/v1/contracts/:id`

**Descripción:** Obtiene la información completa de un contrato específico por su ID.

**Autenticación:** ✅ Requiere `coordinador`, `comercia`, `operador`, `contabilidad`, `admin` o `superadmon`

**URL Parameters:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | ID del contrato |

**Ejemplo de Request:**

```bash
curl -X GET "https://api.example.com/api/v1/contracts/64f8a1b2c3d4e5f6g7h8i9j1" \
  -H "Cookie: _session_token_=..."
```

**Respuesta Exitosa (200):**

```json
{
  "message": "Contrato obtenido correctamente",
  "data": {
    "_id": "64f8a1b2c3d4e5f6g7h8i9j1",
    "company_id": "64f8a1b2c3d4e5f6g7h8i9j2",
    "client_id": {
      "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
      "name": "Empresa Cliente S.A.S",
      "contact_name": "Juan Pérez",
      "contact_phone": "3001234567",
      "email": "contacto@empresacliente.com"
    },
    "tipo_contrato": "fijo",
    "periodo_presupuesto": "anio",
    "valor_presupuesto": 50000000,
    "valor_consumido": 12500000,
    "cobro": {
      "modo_default": "por_hora",
      "por_hora": 50000,
      "por_kilometro": 2000
    },
    "historico": [
      {
        "type": "budget_set",
        "created": "2024-01-15T10:30:00.000Z",
        "notes": "Creación de contrato",
        "prev_valor_presupuesto": null,
        "new_valor_presupuesto": 50000000,
        "prev_valor_consumido": 0,
        "new_valor_consumido": 0
      },
      {
        "type": "service_charge",
        "created": "2024-02-01T08:00:00.000Z",
        "solicitud_id": "64f8a1b2c3d4e5f6g7h8i9j4",
        "amount": 12500000,
        "mode": "within_contract",
        "prev_valor_consumido": 0,
        "new_valor_consumido": 12500000
      }
    ],
    "is_active": true,
    "created": "2024-01-15T10:30:00.000Z",
    "created_by": {
      "_id": "64f8a1b2c3d4e5f6g7h8i9j3",
      "full_name": "María González",
      "email": "maria@transportesabc.com",
      "role": "coordinador"
    }
  }
}
```

**Errores Posibles:**

- **404 Not Found:** `"Contrato no encontrado"` - Si el contrato no existe o no pertenece a la compañía del usuario

---

## 3. Listar Contratos de un Cliente

### `GET /api/v1/contracts/client/:client_id`

**Descripción:** Obtiene todos los contratos asociados a un cliente específico. Opcionalmente puede filtrar solo los contratos activos.

**Autenticación:** ✅ Requiere `coordinador`, `comercia`, `operador`, `contabilidad`, `admin` o `superadmon`

**URL Parameters:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `client_id` | string | ID del cliente |

**Query Parameters:**

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| `only_active` | boolean | `false` | Si es `true`, solo retorna contratos activos |

**Ejemplo de Request (Todos los contratos):**

```bash
curl -X GET "https://api.example.com/api/v1/contracts/client/64f8a1b2c3d4e5f6g7h8i9j0" \
  -H "Cookie: _session_token_=..."
```

**Ejemplo de Request (Solo activos):**

```bash
curl -X GET "https://api.example.com/api/v1/contracts/client/64f8a1b2c3d4e5f6g7h8i9j0?only_active=true" \
  -H "Cookie: _session_token_=..."
```

**Respuesta Exitosa (200):**

```json
{
  "message": "Contratos obtenidos correctamente",
  "data": [
    {
      "_id": "64f8a1b2c3d4e5f6g7h8i9j1",
      "company_id": "64f8a1b2c3d4e5f6g7h8i9j2",
      "client_id": "64f8a1b2c3d4e5f6g7h8i9j0",
      "tipo_contrato": "fijo",
      "periodo_presupuesto": "anio",
      "valor_presupuesto": 50000000,
      "valor_consumido": 12500000,
      "is_active": true,
      "created": "2024-01-15T10:30:00.000Z"
    },
    {
      "_id": "64f8a1b2c3d4e5f6g7h8i9j5",
      "company_id": "64f8a1b2c3d4e5f6g7h8i9j2",
      "client_id": "64f8a1b2c3d4e5f6g7h8i9j0",
      "tipo_contrato": "ocasional",
      "valor_presupuesto": null,
      "valor_consumido": 0,
      "is_active": true,
      "created": "2024-02-01T08:00:00.000Z"
    }
  ]
}
```

**Nota:** Los contratos se ordenan por fecha de creación (más recientes primero).

---

## 4. Actualizar Contrato

### `PUT /api/v1/contracts/:id`

**Descripción:** Actualiza los datos de un contrato existente. Permite modificar el tipo de contrato, presupuesto, tarifas, estado activo, etc.

**Autenticación:** ✅ Requiere `coordinador`, `comercia`, `operador`, `contabilidad`, `admin` o `superadmon`

**URL Parameters:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | ID del contrato |

**Body (JSON):**

Todos los campos son opcionales. Solo se actualizan los campos que se envíen.

```json
{
  "tipo_contrato": "fijo",
  "periodo_presupuesto": "mes",
  "valor_presupuesto": 60000000,
  "cobro": {
    "modo_default": "por_kilometro",
    "por_kilometro": 2500,
    "por_hora": 55000
  },
  "is_active": true,
  "notes": "Actualización de presupuesto mensual"
}
```

**Parámetros del Body:**

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `tipo_contrato` | string | ❌ No | `"fijo"` o `"ocasional"` |
| `periodo_presupuesto` | string | ❌ No | `"anio"`, `"mes"`, `"semana"`, `"dia"` |
| `valor_presupuesto` | number \| null | ❌ No | Nuevo valor del presupuesto (o `null` para eliminar) |
| `cobro` | object | ❌ No | Objeto con las tarifas actualizadas |
| `is_active` | boolean | ❌ No | Estado activo/inactivo del contrato |
| `notes` | string | ❌ No | Notas sobre la actualización |

**Ejemplo de Request:**

```bash
curl -X PUT "https://api.example.com/api/v1/contracts/64f8a1b2c3d4e5f6g7h8i9j1" \
  -H "Content-Type: application/json" \
  -H "Cookie: _session_token_=..." \
  -d '{
    "valor_presupuesto": 60000000,
    "cobro": {
      "modo_default": "por_kilometro",
      "por_kilometro": 2500
    },
    "notes": "Aumento de presupuesto anual"
  }'
```

**Respuesta Exitosa (200):**

```json
{
  "message": "Contrato actualizado correctamente",
  "data": {
    "_id": "64f8a1b2c3d4e5f6g7h8i9j1",
    "company_id": "64f8a1b2c3d4e5f6g7h8i9j2",
    "client_id": "64f8a1b2c3d4e5f6g7h8i9j0",
    "tipo_contrato": "fijo",
    "periodo_presupuesto": "anio",
    "valor_presupuesto": 60000000,
    "valor_consumido": 12500000,
    "cobro": {
      "modo_default": "por_kilometro",
      "por_kilometro": 2500
    },
    "historico": [
      {
        "type": "budget_set",
        "created": "2024-01-15T10:30:00.000Z",
        "notes": "Creación de contrato",
        "prev_valor_presupuesto": null,
        "new_valor_presupuesto": 50000000
      },
      {
        "type": "budget_set",
        "created": "2024-03-01T12:00:00.000Z",
        "notes": "Aumento de presupuesto anual",
        "prev_valor_presupuesto": 50000000,
        "new_valor_presupuesto": 60000000,
        "prev_valor_consumido": 12500000,
        "new_valor_consumido": 12500000
      }
    ],
    "is_active": true,
    "created": "2024-01-15T10:30:00.000Z"
  }
}
```

**Nota:** Cuando se actualiza el presupuesto o el tipo de contrato, se crea automáticamente un evento en el historial del contrato.

**Errores Posibles:**

- **404 Not Found:** `"Contrato no encontrado"` - Si el contrato no existe o no pertenece a la compañía del usuario

---

## 5. Aplicar Cargo a Contrato

### `POST /api/v1/contracts/:id/charge`

**Descripción:** Aplica un cargo manual al contrato, descontando del presupuesto disponible. Este endpoint se usa principalmente para cargos manuales o cuando se necesita ajustar el consumo del contrato.

**Autenticación:** ✅ Requiere `coordinador`, `comercia`, `operador`, `contabilidad`, `admin` o `superadmon`

**URL Parameters:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | ID del contrato |

**Body (JSON):**

```json
{
  "amount": 15000000,
  "solicitud_id": "64f8a1b2c3d4e5f6g7h8i9j4",
  "notes": "Cargo por servicio de transporte ejecutivo"
}
```

**Parámetros del Body:**

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `amount` | number | ✅ Sí | Monto a descontar del contrato (debe ser > 0) |
| `solicitud_id` | string | ❌ No | ID de la solicitud relacionada (opcional) |
| `notes` | string | ❌ No | Notas sobre el cargo |

**Ejemplo de Request:**

```bash
curl -X POST "https://api.example.com/api/v1/contracts/64f8a1b2c3d4e5f6g7h8i9j1/charge" \
  -H "Content-Type: application/json" \
  -H "Cookie: _session_token_=..." \
  -d '{
    "amount": 15000000,
    "solicitud_id": "64f8a1b2c3d4e5f6g7h8i9j4",
    "notes": "Cargo por servicio ejecutivo"
  }'
```

**Respuesta Exitosa (200):**

```json
{
  "message": "Cargo aplicado correctamente",
  "data": {
    "_id": "64f8a1b2c3d4e5f6g7h8i9j1",
    "company_id": "64f8a1b2c3d4e5f6g7h8i9j2",
    "client_id": "64f8a1b2c3d4e5f6g7h8i9j0",
    "tipo_contrato": "fijo",
    "valor_presupuesto": 50000000,
    "valor_consumido": 27500000,
    "historico": [
      {
        "type": "service_charge",
        "created": "2024-02-15T14:30:00.000Z",
        "solicitud_id": "64f8a1b2c3d4e5f6g7h8i9j4",
        "amount": 15000000,
        "mode": "within_contract",
        "prev_valor_consumido": 12500000,
        "new_valor_consumido": 27500000,
        "notes": "Cargo por servicio ejecutivo"
      }
    ],
    "is_active": true
  }
}
```

**Errores Posibles:**

- **400 Bad Request:** `"amount debe ser mayor a 0"` - Si el monto es inválido
- **400 Bad Request:** `"El contrato está inactivo"` - Si se intenta cargar a un contrato inactivo
- **400 Bad Request:** `"El cargo excede el valor_presupuesto del contrato"` - Si el cargo haría que el consumo supere el presupuesto
- **404 Not Found:** `"Contrato no encontrado"` - Si el contrato no existe o no pertenece a la compañía del usuario

**Nota:** Los cargos automáticos se aplican cuando se acepta una solicitud con `contract_charge_mode = "within_contract"`. Este endpoint es para cargos manuales o ajustes.

---

## 6. Consultar Contrato desde una Solicitud

### Opción A: Desde el Objeto de Solicitud

Cuando una solicitud está asociada a un contrato, el contrato se almacena en los siguientes campos de la solicitud:

- `contract_id`: ID del contrato asociado
- `contract_charge_mode`: Modo de cargo (`"within_contract"`, `"outside_contract"`, `"no_contract"`)
- `contract_charge_amount`: Monto cargado al contrato

**Ejemplo de Solicitud con Contrato:**

```json
{
  "_id": "64f8a1b2c3d4e5f6g7h8i9j4",
  "cliente": "64f8a1b2c3d4e5f6g7h8i9j0",
  "fecha": "2024-02-15T08:00:00.000Z",
  "origen": "Bogotá",
  "destino": "Medellín",
  "valor_a_facturar": 15000000,
  "contract_id": "64f8a1b2c3d4e5f6g7h8i9j1",
  "contract_charge_mode": "within_contract",
  "contract_charge_amount": 15000000,
  "status": "accepted"
}
```

Para obtener el contrato completo, usa el endpoint:

```bash
GET /api/v1/contracts/{contract_id}
```

### Opción B: Consultar Contratos del Cliente de la Solicitud

Si necesitas ver todos los contratos disponibles de un cliente (por ejemplo, para seleccionar uno al aceptar una solicitud):

```bash
GET /api/v1/contracts/client/{client_id}?only_active=true
```

Esto retorna todos los contratos activos del cliente, que puedes usar para asociar a la solicitud.

---

## 7. Tipos de Datos

### ContractType

```typescript
type ContractType = "fijo" | "ocasional";
```

- **`"fijo"`**: Contrato con presupuesto definido y período de consumo
- **`"ocasional"`**: Contrato sin presupuesto, solo con tarifas de cobro

### ContractBudgetPeriod

```typescript
type ContractBudgetPeriod = "anio" | "mes" | "semana" | "dia";
```

Período de validez del presupuesto para contratos fijos.

### ContractPricingMode

```typescript
type ContractPricingMode = "por_hora" | "por_kilometro" | "por_distancia" | "tarifa_amva";
```

Modos de cobro disponibles:
- **`"por_hora"`**: Cobro basado en horas de servicio
- **`"por_kilometro"`**: Cobro basado en kilómetros recorridos
- **`"por_distancia"`**: Cobro fijo por trayecto
- **`"tarifa_amva"`**: Cobro según tarifa AMVA

### ContractChargeMode

```typescript
type ContractChargeMode = "within_contract" | "outside_contract" | "no_contract";
```

Modos de cargo al contrato:
- **`"within_contract"`**: El servicio se carga al presupuesto del contrato
- **`"outside_contract"`**: El servicio no se carga al contrato (facturación independiente)
- **`"no_contract"`**: No hay contrato asociado

### ContractHistoryEvent

Eventos del historial del contrato:

```typescript
interface ContractHistoryEvent {
  type: "budget_set" | "service_charge" | "manual_adjust";
  created: Date;
  created_by?: ObjectId;
  notes?: string;
  prev_valor_presupuesto?: number | null;
  new_valor_presupuesto?: number | null;
  prev_valor_consumido?: number;
  new_valor_consumido?: number;
  solicitud_id?: ObjectId;  // Solo para service_charge
  amount?: number;           // Solo para service_charge
  mode?: "within_contract" | "outside_contract";
}
```

---

## 8. Códigos de Estado HTTP

| Código | Descripción | Cuándo se Retorna |
|--------|-------------|-------------------|
| **200** | OK | Operación exitosa (GET, PUT) |
| **201** | Created | Contrato creado exitosamente |
| **400** | Bad Request | Datos inválidos, validaciones fallidas |
| **401** | Unauthorized | No autenticado o sin permisos |
| **404** | Not Found | Recurso no encontrado |
| **500** | Internal Server Error | Error del servidor |

---

## 🔗 Relación con Solicitudes

### Asociar Contrato a una Solicitud

Cuando se acepta una solicitud (`POST /api/v1/solicitudes/:id/accept`), se puede asociar un contrato:

**Body de Aceptación de Solicitud:**

```json
{
  "he": "HE-2024-001",
  "empresa": "national",
  "placa": "ABC123",
  "conductor_id": "64f8a1b2c3d4e5f6g7h8i9j6",
  "nombre_cuenta_cobro": "Servicio Ejecutivo",
  "valor_cancelado": 0,
  "valor_a_facturar": 15000000,
  "utilidad": 3000000,
  "porcentaje_utilidad": 20,
  "contract_id": "64f8a1b2c3d4e5f6g7h8i9j1",
  "contract_charge_mode": "within_contract",
  "contract_charge_amount": 15000000,
  "pricing_mode": "por_hora"
}
```

Si `contract_charge_mode = "within_contract"`, el sistema automáticamente:
1. Descuenta el monto del presupuesto del contrato
2. Actualiza `valor_consumido` del contrato
3. Crea un evento en el historial del contrato
4. Asocia la solicitud al contrato

### Consultar Contratos Disponibles para un Cliente

Antes de aceptar una solicitud, puedes consultar los contratos activos del cliente:

```bash
GET /api/v1/contracts/client/{client_id}?only_active=true
```

Esto te permite mostrar al coordinador los contratos disponibles para asociar a la solicitud.

---

## 📝 Notas Importantes

1. **Presupuesto y Consumo**: 
   - Los contratos fijos tienen un `valor_presupuesto` y un `valor_consumido`
   - El sistema no permite que `valor_consumido` exceda `valor_presupuesto`
   - Los contratos ocasionales no tienen presupuesto (`valor_presupuesto = null`)

2. **Historial**:
   - Todos los cambios importantes se registran en el array `historico`
   - Los eventos incluyen valores antes/después para auditoría
   - Los cargos por servicio incluyen el `solicitud_id` relacionado

3. **Tarifas de Cobro**:
   - El campo `cobro.modo_default` indica qué tarifa usar por defecto
   - Las tarifas se usan para estimar precios al crear solicitudes
   - Puedes tener múltiples tarifas definidas y elegir cuál usar

4. **Estado Activo**:
   - Solo los contratos activos (`is_active = true`) pueden recibir cargos
   - Puedes desactivar un contrato actualizando `is_active = false`

5. **Seguridad**:
   - Todos los endpoints validan que el contrato pertenezca a la compañía del usuario
   - No puedes acceder a contratos de otras compañías

---

## 🎯 Ejemplos de Flujo Completo

### Flujo 1: Crear Contrato y Usarlo en Solicitud

1. **Crear contrato fijo:**
   ```bash
   POST /api/v1/contracts
   {
     "client_id": "...",
     "tipo_contrato": "fijo",
     "periodo_presupuesto": "anio",
     "valor_presupuesto": 50000000,
     "cobro": { "modo_default": "por_hora", "por_hora": 50000 }
   }
   ```

2. **Cliente crea solicitud:**
   ```bash
   POST /api/v1/solicitudes/client
   {
     "fecha": "2024-02-15",
     "hora_inicio": "08:00",
     "origen": "Bogotá",
     "destino": "Medellín",
     "n_pasajeros": 25
   }
   ```

3. **Coordinador acepta solicitud con contrato:**
   ```bash
   POST /api/v1/solicitudes/{id}/accept
   {
     "contract_id": "...",
     "contract_charge_mode": "within_contract",
     "contract_charge_amount": 15000000,
     ...
   }
   ```

4. **Verificar consumo del contrato:**
   ```bash
   GET /api/v1/contracts/{contract_id}
   # valor_consumido ahora es 15000000
   ```

### Flujo 2: Aplicar Cargo Manual

1. **Aplicar cargo manual al contrato:**
   ```bash
   POST /api/v1/contracts/{id}/charge
   {
     "amount": 10000000,
     "notes": "Ajuste manual por servicio adicional"
   }
   ```

2. **Verificar historial:**
   ```bash
   GET /api/v1/contracts/{id}
   # El historial incluye el nuevo evento de cargo
   ```

---

**Última actualización:** 2024-01-15

