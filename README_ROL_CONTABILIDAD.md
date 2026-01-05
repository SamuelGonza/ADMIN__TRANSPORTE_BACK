# 📊 Documentación Completa - Rol Contabilidad

**Fecha de actualización:** Enero 2025

Este documento describe todas las funcionalidades, endpoints y permisos disponibles para el rol **contabilidad** en el sistema.

---

## 📋 Tabla de Contenidos

1. [Permisos y Autenticación](#permisos-y-autenticación)
2. [Endpoints Disponibles](#endpoints-disponibles)
3. [Datos Financieros](#datos-financieros)
4. [Payment Sections (Secciones de Pago)](#payment-sections-secciones-de-pago)
5. [Reportes y Documentos](#reportes-y-documentos)
6. [Ejemplos de Uso](#ejemplos-de-uso)

---

## 🔐 Permisos y Autenticación

### Roles Permitidos

El rol `contabilidad` tiene acceso a funcionalidades específicas del sistema. Puede acceder a endpoints protegidos por:

- **`ContabilidadAuth`**: Solo contabilidad, admin y superadmon
- **`OperadorContabilidadAuth`**: Operador, contabilidad, coordinador, admin y superadmon
- **`GestionAuth`**: Coordinador, comercial, operador, contabilidad, admin y superadmon
- **`ReportsDownloadAuth`**: Contabilidad, coordinador, admin y superadmon

### Autenticación

Todas las peticiones requieren una cookie de sesión `_session_token_` que se obtiene al hacer login.

```typescript
// Ejemplo de configuración para fetch
fetch(url, {
    method: "GET",
    credentials: "include",  // ← OBLIGATORIO para enviar cookies
    headers: { "Content-Type": "application/json" }
});
```

---

## 📍 Endpoints Disponibles

### 1. Solicitudes (Servicios)

#### 1.1. Listar Todas las Solicitudes

**Endpoint:** `GET /api/v1/solicitudes`

**Autenticación:** `OperadorContabilidadAuth`

**Parámetros Query:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `page` | number | Página (default: 1) |
| `limit` | number | Límite por página (default: 10) |
| `bitacora_id` | string | Filtrar por bitácora |
| `cliente_id` | string | Filtrar por cliente |
| `conductor_id` | string | Filtrar por conductor |
| `vehiculo_id` | string | Filtrar por vehículo |
| `status` | string | `pending`, `accepted`, `rejected` |
| `service_status` | string | `sin_asignacion`, `not-started`, `started`, `finished` |
| `empresa` | string | `travel`, `national` |
| `fecha_inicio` | date | Filtrar desde fecha |
| `fecha_fin` | date | Filtrar hasta fecha |

**Respuesta:**
```json
{
  "message": "Solicitudes obtenidas correctamente",
  "data": {
    "solicitudes": [
      {
        "_id": "...",
        "fecha": "2024-01-15T00:00:00.000Z",
        "hora_inicio": "08:00",
        "origen": "Medellín",
        "destino": "Bogotá",
        "valor_a_facturar": 600000,
        "valor_cancelado": 500000,
        "utilidad": 100000,
        "porcentaje_utilidad": 16.67,
        "total_gastos_operacionales": 0,
        "n_factura": "FAC-001",
        "fecha_factura": "2024-01-16T00:00:00.000Z",
        "n_egreso": "EGR-001",
        "fecha_cancelado": "2024-01-17T00:00:00.000Z",
        "doc_soporte": "DOC-001",
        "cliente": { ... },
        "vehiculo_id": { ... },
        "conductor": { ... }
      }
    ],
    "pagination": {
      "total": 100,
      "page": 1,
      "limit": 10,
      "totalPages": 10
    }
  }
}
```

**⚠️ Nota:** El rol contabilidad **SÍ puede ver** `utilidad` y `porcentaje_utilidad` (a diferencia del coordinador que no los ve).

---

#### 1.2. Obtener Solicitud por ID

**Endpoint:** `GET /api/v1/solicitudes/:id`

**Autenticación:** `OperadorContabilidadAuth`

**Respuesta:** Incluye todos los datos financieros, contabilidad por bus, y payment section.

---

#### 1.3. Crear Solicitud (Coordinador)

**Endpoint:** `POST /api/v1/solicitudes/coordinator`

**Autenticación:** `OperadorContabilidadAuth`

**Body:**
```json
{
  "bitacora_id": "...",
  "cliente_id": "...",
  "fecha": "2024-01-15",
  "hora_inicio": "08:00",
  "origen": "Medellín",
  "destino": "Bogotá",
  "n_pasajeros": 40,
  "placa": "ABC123",
  "he": "HE-001",
  "empresa": "national",
  "estimated_km": 400,
  "estimated_hours": 8
}
```

---

#### 1.4. Actualizar Datos Financieros

**Endpoint:** `PUT /api/v1/solicitudes/:id/financial`

**Autenticación:** `ContabilidadAuth` (solo contabilidad)

**Body:**
```json
{
  "doc_soporte": "DOC-001",
  "fecha_cancelado": "2024-01-17T00:00:00.000Z",
  "n_egreso": "EGR-001",
  "n_factura": "FAC-001",
  "fecha_factura": "2024-01-16T00:00:00.000Z"
}
```

**Descripción:** Actualiza los datos financieros de una solicitud (facturación, egresos, documentos de soporte).

---

#### 1.5. Calcular Liquidación Automática

**Endpoint:** `POST /api/v1/solicitudes/:id/calcular-liquidacion`

**Autenticación:** `ContabilidadAuth` (solo contabilidad)

**Descripción:** Calcula automáticamente:
- `total_gastos_operacionales`: Suma de gastos operacionales vinculados a la solicitud
- `utilidad`: `valor_a_facturar - valor_cancelado - total_gastos_operacionales`
- `porcentaje_utilidad`: `(utilidad / valor_a_facturar) * 100`
- `valor_documento_equivalente`: Se establece igual a `utilidad` si no está definido

**Respuesta:**
```json
{
  "message": "Liquidación calculada correctamente",
  "data": {
    "valor_a_facturar": 600000,
    "valor_cancelado": 500000,
    "total_gastos_operacionales": 50000,
    "total_gastos": 50000,
    "utilidad": 50000,
    "porcentaje_utilidad": 8.33,
    "valor_documento_equivalente": 50000
  }
}
```

---

#### 1.6. Actualizar Contabilidad por Bus Asignado

**Endpoint:** `PUT /api/v1/solicitudes/:id/vehicle/:vehiculo_id/accounting`

**Autenticación:** `ContabilidadAuth` (solo contabilidad)

**Descripción:** Actualiza la información contable de un vehículo específico asignado a una solicitud (cuando hay múltiples buses).

**Body:**
```json
{
  "accounting": {
    "prefactura": {
      "numero": "PREF-001",
      "fecha": "2024-01-15T00:00:00.000Z"
    },
    "preliquidacion": {
      "numero": "PREL-001",
      "fecha": "2024-01-16T00:00:00.000Z"
    },
    "factura": {
      "numero": "FAC-001",
      "fecha": "2024-01-17T00:00:00.000Z"
    },
    "doc_equivalente": {
      "numero": "DOC-001",
      "fecha": "2024-01-18T00:00:00.000Z"
    },
    "pagos": [
      {
        "fecha": "2024-01-20T00:00:00.000Z",
        "valor": 500000,
        "referencia": "REF-001"
      }
    ],
    "notas": "Notas adicionales sobre la contabilidad"
  }
}
```

---

### 2. Payment Sections (Secciones de Pago)

#### 2.1. Obtener Sección de Pagos por Solicitud

**Endpoint:** `GET /api/v1/payment-sections/solicitud/:solicitud_id`

**Autenticación:** `GestionAuth` (incluye contabilidad)

**Descripción:** Obtiene la sección de pagos de una solicitud con todas las cuentas de cobro, conductores, vehículos y propietarios populizados.

**Respuesta:**
```json
{
  "message": "Sección de pagos obtenida correctamente",
  "data": {
    "_id": "...",
    "solicitud_id": "...",
    "company_id": "...",
    "cuentas_cobro": [
      {
        "vehiculo_id": {
          "_id": "...",
          "placa": "ABC123",
          "name": "Bus Ejecutivo 1"
        },
        "conductor_id": {
          "_id": "...",
          "full_name": "Juan Conductor",
          "document": { "type": "cc", "number": 1234567890 }
        },
        "placa": "ABC123",
        "propietario": {
          "type": "Company",
          "company_id": {
            "_id": "...",
            "company_name": "Transportes XYZ",
            "document": { ... }
          }
        },
        "valor_base": 500000,
        "gastos_operacionales": 50000,
        "gastos_preoperacionales": 0,
        "valor_final": 450000,
        "estado": "calculada",
        "n_factura": "FAC-001",
        "fecha_factura": "2024-01-16T00:00:00.000Z",
        "n_egreso": "EGR-001",
        "fecha_cancelado": "2024-01-17T00:00:00.000Z"
      }
    ],
    "total_valor_base": 500000,
    "total_gastos_operacionales": 50000,
    "total_gastos_preoperacionales": 0,
    "total_valor_final": 450000,
    "estado": "calculada",
    "created": "2024-01-15T10:30:00.000Z",
    "updated": "2024-01-17T14:30:00.000Z"
  }
}
```

---

### 3. Contratos

#### 3.1. Listar Contratos

**Endpoint:** `GET /api/v1/contracts`

**Autenticación:** `GestionAuth` (incluye contabilidad)

**Parámetros Query:**
- `only_active` (boolean): Si es `true`, solo retorna contratos activos

**Descripción:** Lista todos los contratos de la compañía del usuario autenticado.

---

#### 3.2. Obtener Contrato por ID

**Endpoint:** `GET /api/v1/contracts/:id`

**Autenticación:** `GestionAuth` (incluye contabilidad)

---

#### 3.3. Obtener Contratos de un Cliente

**Endpoint:** `GET /api/v1/contracts/client/:client_id`

**Autenticación:** `GestionAuth` (incluye contabilidad)

---

#### 3.4. Aplicar Cargo Manual a Contrato

**Endpoint:** `POST /api/v1/contracts/:id/charge`

**Autenticación:** `GestionAuth` (incluye contabilidad)

**Body:**
```json
{
  "amount": 500000,
  "solicitud_id": "...",
  "notes": "Cargo manual por servicio adicional"
}
```

---

### 4. Vehículos

#### 4.1. Listar Vehículos

**Endpoint:** `GET /api/v1/vehicles`

**Autenticación:** `SessionAuth` (todos los usuarios autenticados)

**Parámetros Query:**
- `page` (number)
- `limit` (number)
- `placa` (string): Búsqueda parcial
- `type` (string): Tipo de vehículo
- `name` (string): Búsqueda parcial

---

#### 4.2. Buscar Vehículos por Placa (Autocomplete)

**Endpoint:** `GET /api/v1/vehicles/search/placa`

**Autenticación:** `SessionAuth`

**Parámetros Query:**
- `placa` (string, requerido): Placa o parte de la placa
- `company_id` (string, opcional)
- `limit` (number, default: 10)

**Descripción:** Busca vehículos por placa mientras el usuario escribe. Incluye vehículos propios, afiliados y externos de la compañía.

---

#### 4.3. Registrar Gastos Operacionales

**Endpoint:** `POST /api/v1/vehicles/operational-bills`

**Autenticación:** `OperadorContabilidadAuth`

**Content-Type:** `multipart/form-data`

**Body (FormData):**
```
vehicle_id: "..."
user_id: "..." (opcional)
solicitud_id: "..." (opcional - vincula gastos a una solicitud)
bills: JSON.stringify([
  {
    "type_bill": "fuel",
    "value": 50000,
    "description": "Combustible"
  },
  {
    "type_bill": "tolls",
    "value": 20000,
    "description": "Peajes"
  }
])
bills[0][media_support]: File (opcional)
bills[1][media_support]: File (opcional)
```

**Tipos de gastos:** `fuel`, `tolls`, `repairs`, `fines`, `parking_lot`

**⚠️ Importante:** Si se proporciona `solicitud_id`, los gastos se vinculan automáticamente a la solicitud y se recalcula la liquidación.

---

#### 4.4. Crear Reporte Preoperacional

**Endpoint:** `POST /api/v1/vehicles/preoperational`

**Autenticación:** `OperadorContabilidadAuth`

**Content-Type:** `multipart/form-data`

**Body (FormData):**
```
vehicle_id: "..."
driver_id: "..." (opcional)
reports: JSON.stringify([
  {
    "description": "Revisión de frenos",
    "status": "ok"
  },
  {
    "description": "Revisión de luces",
    "status": "details"
  }
])
reports[0][media]: File (opcional)
reports[1][media]: File (opcional)
```

**Estados:** `ok`, `details`, `failures`

---

#### 4.5. Obtener Historial de Gastos Operacionales

**Endpoint:** `GET /api/v1/vehicles/:vehicle_id/operationals`

**Autenticación:** `OperadorContabilidadAuth`

**Parámetros Query:**
- `page` (number, default: 1)
- `limit` (number, default: 10)

---

#### 4.6. Obtener Historial de Reportes Preoperacionales

**Endpoint:** `GET /api/v1/vehicles/:vehicle_id/preoperationals`

**Autenticación:** `OperadorContabilidadAuth`

**Parámetros Query:**
- `page` (number, default: 1)
- `limit` (number, default: 10)

---

#### 4.7. Obtener Último Gasto Operacional

**Endpoint:** `GET /api/v1/vehicles/:vehicle_id/last-operational`

**Autenticación:** `OperadorContabilidadAuth`

---

#### 4.8. Obtener Último Reporte Preoperacional

**Endpoint:** `GET /api/v1/vehicles/:vehicle_id/last-preoperational`

**Autenticación:** `OperadorContabilidadAuth`

---

#### 4.9. Descargar Ficha Técnica del Vehículo (PDF)

**Endpoint:** `GET /api/v1/vehicles/:id/technical-sheet-pdf`

**Autenticación:** `ReportsDownloadAuth` (incluye contabilidad)

**Respuesta:** Archivo PDF descargable

---

### 5. Bitácoras

#### 5.1. Listar Bitácoras

**Endpoint:** `GET /api/v1/bitacoras`

**Autenticación:** `OperadorContabilidadAuth`

**Parámetros Query:**
- `page` (number, default: 1)
- `limit` (number, default: 10)
- `company_id` (string, opcional)
- `year` (string): Filtrar por año (ej: "2024")
- `month` (string): Filtrar por mes (ej: "01", "02")

---

#### 5.2. Obtener Bitácora por ID

**Endpoint:** `GET /api/v1/bitacoras/:id`

**Autenticación:** `OperadorContabilidadAuth`

---

### 6. Usuarios

#### 6.1. Listar Usuarios

**Endpoint:** `GET /api/v1/users`

**Autenticación:** `UsersReadAuth` (incluye contabilidad)

**Parámetros Query:**
- `page` (number)
- `limit` (number)
- `name` (string): Búsqueda parcial
- `document` (number)
- `email` (string): Búsqueda parcial
- `company_id` (string): Solo superadmin puede usar este filtro
- `role` (string): Filtrar por rol

**⚠️ Nota:** Contabilidad solo puede ver usuarios de su `company_id`.

---

#### 6.2. Listar Usuarios de una Compañía

**Endpoint:** `GET /api/v1/users/company/:company_id`

**Autenticación:** `UsersReadAuth` (incluye contabilidad)

**⚠️ Nota:** Contabilidad solo puede consultar usuarios de su propia `company_id`.

---

#### 6.3. Obtener Usuario por ID

**Endpoint:** `GET /api/v1/users/:id`

**Autenticación:** `UsersReadAuth` (incluye contabilidad)

**⚠️ Nota:** Contabilidad solo puede consultar usuarios de su propia `company_id`.

---

### 7. Compañías

#### 7.1. Obtener Compañía por ID

**Endpoint:** `GET /api/v1/companies/:id`

**Autenticación:** `ContabilidadAuth` (solo contabilidad)

---

#### 7.2. Obtener Información de Facturación Electrónica

**Endpoint:** `GET /api/v1/companies/:id/fe-info`

**Autenticación:** `ContabilidadAuth` (solo contabilidad)

**Descripción:** Obtiene información de facturación electrónica (SIMBA token, FE ID).

**Respuesta:**
```json
{
  "message": "Información FE obtenida correctamente",
  "data": {
    "simba_token": "eyJhbGciOiJIUzI1NiIs...",
    "fe_id": "FE-REF-001"
  }
}
```

---

## 💰 Datos Financieros

### Campos Financieros en Solicitudes

El rol contabilidad puede ver y modificar los siguientes campos financieros en las solicitudes:

#### Ingresos
- `valor_a_facturar` (number): Valor a facturar al cliente
- `n_factura` (string): Número de factura
- `fecha_factura` (Date): Fecha de emisión de la factura

#### Gastos
- `valor_cancelado` (number): Valor cancelado/pagado
- `n_egreso` (string): Número de egreso
- `fecha_cancelado` (Date): Fecha de cancelación
- `doc_soporte` (string): Documento de soporte
- `total_gastos_operacionales` (number): Suma automática de gastos operacionales vinculados

#### Utilidad
- `utilidad` (number): Utilidad calculada
- `porcentaje_utilidad` (number): Porcentaje de utilidad
- `valor_documento_equivalente` (number): Valor para documento legal equivalente

**⚠️ Importante:** El rol contabilidad **SÍ puede ver** `utilidad` y `porcentaje_utilidad` (a diferencia del coordinador).

---

### Contabilidad por Bus (Multi-vehículo)

Cuando una solicitud tiene múltiples vehículos asignados, cada vehículo tiene su propia información contable:

```typescript
interface VehicleAssignmentAccounting {
  prefactura?: {
    numero?: string;
    fecha?: Date;
  };
  preliquidacion?: {
    numero?: string;
    fecha?: Date;
  };
  factura?: {
    numero?: string;
    fecha?: Date;
  };
  doc_equivalente?: {
    numero?: string;
    fecha?: Date;
  };
  pagos?: Array<{
    fecha?: Date;
    valor?: number;
    referencia?: string;
  }>;
  notas?: string;
}
```

---

## 📊 Payment Sections (Secciones de Pago)

### ¿Qué es una Payment Section?

Una **Payment Section** agrupa todas las cuentas de cobro de una solicitud, organizadas por propietario de vehículo. Se crea automáticamente cuando se asignan vehículos a una solicitud.

### Estructura de Cuenta de Cobro

```typescript
interface CuentaCobro {
  vehiculo_id: ObjectId;
  conductor_id: ObjectId;
  placa: string;
  propietario: {
    type: "Company" | "User";
    company_id?: ObjectId;
    user_id?: ObjectId;
    nombre: string;
  };
  valor_base: number;
  gastos_operacionales: number;
  gastos_preoperacionales: number;
  valor_final: number;
  estado: "pendiente" | "calculada" | "parcialmente_pagada" | "pagada" | "cancelada";
  n_factura?: string;
  fecha_factura?: Date;
  n_egreso?: string;
  fecha_cancelado?: Date;
}
```

### Estados de Payment Section

| Estado | Descripción |
|--------|-------------|
| `pendiente` | Sección creada, pendiente de cálculo |
| `calculada` | Valores calculados, lista para facturación |
| `parcialmente_pagada` | Algunas cuentas de cobro pagadas |
| `pagada` | Todas las cuentas de cobro pagadas |
| `cancelada` | Sección cancelada |

---

## 📄 Reportes y Documentos

### Documentos Disponibles

1. **Ficha Técnica del Vehículo (PDF)**
   - Endpoint: `GET /api/v1/vehicles/:id/technical-sheet-pdf`
   - Incluye: Datos del vehículo, conductor, documentos, vencimientos

2. **Manifiesto de Pasajeros (PDF)**
   - Endpoint: `GET /api/v1/solicitudes/:id/passenger-manifest-pdf`
   - Incluye: Lista de pasajeros del servicio

---

## 💡 Ejemplos de Uso

### Ejemplo 1: Calcular Liquidación de un Servicio

```typescript
// 1. Primero, establecer valores financieros (si no están establecidos)
const setFinancialValues = async (solicitudId: string) => {
  const response = await fetch(`/api/v1/solicitudes/${solicitudId}/set-financial-values`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      valor_a_facturar: 600000,
      valor_cancelado: 500000
    })
  });
  return response.json();
};

// 2. Calcular liquidación automática
const calcularLiquidacion = async (solicitudId: string) => {
  const response = await fetch(`/api/v1/solicitudes/${solicitudId}/calcular-liquidacion`, {
    method: "POST",
    credentials: "include"
  });
  const { data } = await response.json();
  console.log("Utilidad:", data.utilidad);
  console.log("Porcentaje:", data.porcentaje_utilidad);
  return data;
};
```

---

### Ejemplo 2: Registrar Gastos Operacionales y Vincular a Solicitud

```typescript
const registrarGastos = async (vehicleId: string, solicitudId: string) => {
  const formData = new FormData();
  formData.append("vehicle_id", vehicleId);
  formData.append("solicitud_id", solicitudId); // Vincular a solicitud
  formData.append("bills", JSON.stringify([
    {
      type_bill: "fuel",
      value: 50000,
      description: "Combustible"
    },
    {
      type_bill: "tolls",
      value: 20000,
      description: "Peajes"
    }
  ]));

  // Si hay archivos de soporte
  // formData.append("bills[0][media_support]", file1);
  // formData.append("bills[1][media_support]", file2);

  const response = await fetch("/api/v1/vehicles/operational-bills", {
    method: "POST",
    credentials: "include",
    body: formData
  });
  
  // Los gastos se vinculan automáticamente y se recalcula la liquidación
  return response.json();
};
```

---

### Ejemplo 3: Obtener Payment Section y Actualizar Contabilidad

```typescript
// 1. Obtener sección de pagos
const getPaymentSection = async (solicitudId: string) => {
  const response = await fetch(`/api/v1/payment-sections/solicitud/${solicitudId}`, {
    credentials: "include"
  });
  const { data } = await response.json();
  return data;
};

// 2. Actualizar contabilidad de un vehículo específico
const updateVehicleAccounting = async (
  solicitudId: string, 
  vehiculoId: string,
  accountingData: any
) => {
  const response = await fetch(
    `/api/v1/solicitudes/${solicitudId}/vehicle/${vehiculoId}/accounting`,
    {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accounting: {
          prefactura: {
            numero: "PREF-001",
            fecha: new Date().toISOString()
          },
          factura: {
            numero: "FAC-001",
            fecha: new Date().toISOString()
          },
          pagos: [
            {
              fecha: new Date().toISOString(),
              valor: 500000,
              referencia: "REF-001"
            }
          ]
        }
      })
    }
  );
  return response.json();
};
```

---

### Ejemplo 4: Actualizar Datos Financieros de una Solicitud

```typescript
const updateFinancialData = async (solicitudId: string) => {
  const response = await fetch(`/api/v1/solicitudes/${solicitudId}/financial`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      doc_soporte: "DOC-001",
      fecha_cancelado: "2024-01-17T00:00:00.000Z",
      n_egreso: "EGR-001",
      n_factura: "FAC-001",
      fecha_factura: "2024-01-16T00:00:00.000Z"
    })
  });
  return response.json();
};
```

---

### Ejemplo 5: Listar Solicitudes con Filtros Financieros

```typescript
const getSolicitudesWithFilters = async () => {
  const params = new URLSearchParams({
    page: "1",
    limit: "20",
    service_status: "finished", // Solo servicios finalizados
    fecha_inicio: "2024-01-01",
    fecha_fin: "2024-01-31"
  });

  const response = await fetch(`/api/v1/solicitudes?${params}`, {
    credentials: "include"
  });
  
  const { data } = await response.json();
  
  // Filtrar solo solicitudes con factura
  const facturadas = data.solicitudes.filter((s: any) => s.n_factura);
  
  return facturadas;
};
```

---

## 🔄 Flujo de Trabajo Recomendado

### Proceso Completo de Contabilidad

1. **Servicio Finalizado**
   - El coordinador marca el servicio como `finished`
   - El servicio queda listo para procesamiento contable

2. **Establecer Valores Financieros** (Comercial)
   - El comercial establece `valor_a_facturar` y `valor_cancelado`
   - Endpoint: `PUT /solicitudes/:id/set-financial-values`

3. **Registrar Gastos Operacionales** (Contabilidad)
   - Registrar gastos vinculados a la solicitud
   - Endpoint: `POST /vehicles/operational-bills` (con `solicitud_id`)

4. **Calcular Liquidación** (Contabilidad)
   - Calcular automáticamente utilidad y porcentaje
   - Endpoint: `POST /solicitudes/:id/calcular-liquidacion`

5. **Actualizar Datos Financieros** (Contabilidad)
   - Registrar números de factura, egresos, fechas
   - Endpoint: `PUT /solicitudes/:id/financial`

6. **Actualizar Contabilidad por Bus** (Contabilidad - si aplica)
   - Para servicios con múltiples vehículos
   - Endpoint: `PUT /solicitudes/:id/vehicle/:vehiculo_id/accounting`

7. **Consultar Payment Section** (Contabilidad)
   - Ver resumen consolidado de todas las cuentas de cobro
   - Endpoint: `GET /payment-sections/solicitud/:solicitud_id`

---

## ⚠️ Consideraciones Importantes

### 1. Visibilidad de Utilidades

- ✅ **Contabilidad SÍ puede ver** `utilidad` y `porcentaje_utilidad`
- ❌ **Coordinador NO puede ver** `utilidad` y `porcentaje_utilidad`

### 2. Gastos Operacionales

- Los gastos operacionales se pueden vincular a una solicitud usando `solicitud_id`
- Cuando se vinculan, se recalcula automáticamente la liquidación
- Los gastos se deducen del `valor_final` en la Payment Section

### 3. Payment Section Automática

- La Payment Section se crea automáticamente al asignar vehículos
- No es necesario crearla manualmente
- Se actualiza automáticamente cuando se registran gastos

### 4. Multi-vehículo

- Cuando una solicitud tiene múltiples vehículos, cada uno tiene su propia cuenta de cobro
- Cada vehículo puede tener su propia información contable (prefactura, factura, pagos)

### 5. Contratos

- Los servicios pueden estar vinculados a contratos
- El cargo se puede aplicar dentro del contrato o fuera del contrato
- Los contratos tienen presupuestos y períodos de facturación

---

## 📞 Soporte

Para más información:
- Documentación Swagger: `/api/v1/docs`
- Endpoints de prueba en Postman/Insomnia
- Código fuente en `src/controllers/` y `src/services/`

---

**Última actualización:** Enero 2025

