# 📋 Flujo de Contabilidad - Documentación para Frontend

## 🎯 Resumen

Este documento detalla el nuevo flujo de contabilidad implementado para las solicitudes. **Es importante que el frontend se actualice según estas especificaciones.**

---

## 🔄 Flujo Completo de Contabilidad

### Estados del Flujo

```
1. Venta y Costo Definidos (puede ser antes, durante o después del servicio)
   ↓
   accounting_status: "pendiente_operacional"
   
2. Se suben operacionales de TODOS los vehículos
   ↓
   accounting_status: "operacional_completo"
   
3. Se genera prefactura
   ↓
   accounting_status: "prefactura_pendiente"
   
4. Se aprueba prefactura
   ↓
   accounting_status: "prefactura_aprobada"
   
5. Se marca como lista para facturación
   ↓
   accounting_status: "listo_para_facturacion"
   
6. Se carga en componente de facturación (externo)
   ↓
   accounting_status: "facturado" (opcional, se puede marcar manualmente)
```

---

## 📝 Cambios en el Modelo de Solicitud

### Nuevos Campos Agregados

#### 1. `accounting_status` (string, opcional)
- **Descripción**: Estado del flujo de contabilidad
- **Valores posibles**:
  - `"no_iniciado"` - Estado inicial (default)
  - `"pendiente_operacional"` - Esperando que se suban operacionales
  - `"operacional_completo"` - Todos los operacionales subidos
  - `"prefactura_pendiente"` - Prefactura generada, esperando aprobación
  - `"prefactura_aprobada"` - Prefactura aprobada
  - `"listo_para_facturacion"` - Listo para cargar en componente de facturación
  - `"facturado"` - Ya facturado

#### 2. `prefactura` (objeto, opcional)
- **Descripción**: Información de la prefactura generada
- **Estructura**:
```typescript
prefactura?: {
    numero?: string;              // Número de la prefactura
    fecha?: Date;                 // Fecha de generación
    aprobada?: boolean;           // Si está aprobada o no
    aprobada_por?: ObjectId;      // Usuario que aprobó
    aprobada_fecha?: Date;        // Fecha de aprobación
    rechazada_por?: ObjectId;     // Usuario que rechazó
    rechazada_fecha?: Date;       // Fecha de rechazo
    notas?: string;               // Notas adicionales
}
```

---

## 🆕 Nuevos Endpoints

### 1. Verificar Operacionales Completos

```http
GET /api/v1/solicitudes/:id/verify-operationals
```

**Autenticación**: `ContabilidadAuth` (solo `contabilidad`, `admin`, `superadmon`)

**Descripción**: Verifica que todos los vehículos de la solicitud tengan operacional subido.

**Respuesta exitosa:**
```json
{
  "message": "Todos los vehículos tienen operacional subido",
  "data": {
    "all_complete": true,
    "missing_operationals": []
  }
}
```

**Respuesta cuando faltan operacionales:**
```json
{
  "message": "Faltan operacionales por subir",
  "data": {
    "all_complete": false,
    "missing_operationals": [
      {
        "vehiculo_id": "64f8a1b2c3d4e5f6g7h8i9j0",
        "placa": "ABC123"
      }
    ]
  }
}
```

---

### 2. Generar Prefactura

```http
POST /api/v1/solicitudes/:id/generate-prefactura
```

**Autenticación**: `ContabilidadAuth`

**Descripción**: Genera una prefactura para la solicitud. Requiere que:
- Todos los vehículos tengan operacional subido
- Valores de venta y costos estén definidos
- No exista una prefactura previa

**Body:**
```json
{
  "prefactura_numero": "PREF-2024-001"
}
```

**Validaciones:**
- ❌ Si faltan operacionales: `400 - "Faltan operacionales para los siguientes vehículos: ABC123, XYZ789"`
- ❌ Si no hay valores de venta: `400 - "La solicitud no tiene valores de venta definidos"`
- ❌ Si no hay valores de costos: `400 - "La solicitud no tiene valores de costos definidos"`
- ❌ Si ya existe prefactura: `400 - "Ya existe una prefactura generada para esta solicitud"`

**Respuesta exitosa:**
```json
{
  "message": "Prefactura generada exitosamente",
  "data": {
    "message": "Prefactura generada exitosamente",
    "solicitud": {
      "_id": "...",
      "accounting_status": "prefactura_pendiente",
      "prefactura": {
        "numero": "PREF-2024-001",
        "fecha": "2024-01-15T10:30:00.000Z",
        "aprobada": false
      },
      ...
    }
  }
}
```

**Cambios automáticos:**
- `accounting_status` → `"prefactura_pendiente"`
- Se crea el objeto `prefactura` con número y fecha

---

### 3. Aprobar Prefactura

```http
PUT /api/v1/solicitudes/:id/approve-prefactura
```

**Autenticación**: `ContabilidadAuth`

**Descripción**: Aprueba la prefactura generada.

**Body (opcional):**
```json
{
  "notas": "Prefactura aprobada, todo correcto"
}
```

**Validaciones:**
- ❌ Si no existe prefactura: `400 - "No existe una prefactura generada para esta solicitud"`
- ❌ Si ya está aprobada: `400 - "La prefactura ya fue aprobada"`

**Respuesta exitosa:**
```json
{
  "message": "Prefactura aprobada exitosamente",
  "data": {
    "message": "Prefactura aprobada exitosamente",
    "solicitud": {
      "_id": "...",
      "accounting_status": "prefactura_aprobada",
      "prefactura": {
        "numero": "PREF-2024-001",
        "fecha": "2024-01-15T10:30:00.000Z",
        "aprobada": true,
        "aprobada_por": "64f8a1b2c3d4e5f6g7h8i9j0",
        "aprobada_fecha": "2024-01-15T11:00:00.000Z",
        "notas": "Prefactura aprobada, todo correcto"
      },
      ...
    }
  }
}
```

**Cambios automáticos:**
- `accounting_status` → `"prefactura_aprobada"`
- `prefactura.aprobada` → `true`
- `prefactura.aprobada_por` → ID del usuario
- `prefactura.aprobada_fecha` → Fecha actual

---

### 4. Rechazar Prefactura

```http
PUT /api/v1/solicitudes/:id/reject-prefactura
```

**Autenticación**: `ContabilidadAuth`

**Descripción**: Rechaza la prefactura. Vuelve el estado a `"operacional_completo"` para que se pueda regenerar.

**Body (opcional):**
```json
{
  "notas": "Prefactura rechazada por error en el número"
}
```

**Validaciones:**
- ❌ Si no existe prefactura: `400 - "No existe una prefactura generada para esta solicitud"`

**Respuesta exitosa:**
```json
{
  "message": "Prefactura rechazada",
  "data": {
    "message": "Prefactura rechazada",
    "solicitud": {
      "_id": "...",
      "accounting_status": "operacional_completo",
      "prefactura": {
        "numero": "PREF-2024-001",
        "fecha": "2024-01-15T10:30:00.000Z",
        "aprobada": false,
        "rechazada_por": "64f8a1b2c3d4e5f6g7h8i9j0",
        "rechazada_fecha": "2024-01-15T11:30:00.000Z",
        "notas": "Prefactura rechazada por error en el número"
      },
      ...
    }
  }
}
```

**Cambios automáticos:**
- `accounting_status` → `"operacional_completo"` (permite regenerar prefactura)
- `prefactura.aprobada` → `false`
- `prefactura.rechazada_por` → ID del usuario
- `prefactura.rechazada_fecha` → Fecha actual

---

### 5. Marcar como Lista para Facturación

```http
PUT /api/v1/solicitudes/:id/mark-ready-for-billing
```

**Autenticación**: `ContabilidadAuth`

**Descripción**: Marca la solicitud como lista para facturación cuando se carga en el componente de facturación externo.

**Validaciones:**
- ❌ Si prefactura no está aprobada: `400 - "La prefactura debe estar aprobada antes de marcar como lista para facturación"`

**Respuesta exitosa:**
```json
{
  "message": "Solicitud marcada como lista para facturación",
  "data": {
    "message": "Solicitud marcada como lista para facturación",
    "solicitud": {
      "_id": "...",
      "accounting_status": "listo_para_facturacion",
      ...
    }
  }
}
```

**Cambios automáticos:**
- `accounting_status` → `"listo_para_facturacion"`

---

## 🔄 Flujo Automático

### Actualización Automática de Estados

#### 1. Cuando se establecen valores de venta o costos

**Condición**: Ambos valores están definidos (no requiere que el servicio esté finalizado)

**Acción automática**:
```typescript
if (valor_a_facturar > 0 && valor_cancelado > 0) {
    // Solo actualizar si no tiene un estado más avanzado
    if (!accounting_status || accounting_status === "no_iniciado") {
        accounting_status = "pendiente_operacional"
    }
}
```

**Cuándo ocurre**:
- Al establecer valores de venta (`PUT /solicitudes/:id/set-financial-values`)
- Al establecer valores de costos (`PUT /solicitudes/:id/set-costs`)
- Al finalizar el servicio (`PUT /solicitudes/:id/finish`) si ya tiene venta y costo

**Importante**: El flujo de contabilidad puede iniciarse en cualquier momento, incluso antes de que el servicio comience o mientras está en curso.

#### 2. Cuando se sube un operacional

**Condición**: Se sube un operacional vinculado a la solicitud

**Acción automática**:
- Se verifica si todos los vehículos tienen operacional
- Si todos están completos: `accounting_status = "operacional_completo"`

**Cuándo ocurre**:
- Al subir operacional con `solicitud_id` (`POST /vehicles/operational-bills`)

---

## 📊 Validaciones del Flujo

### Para Generar Prefactura

✅ **Requisitos:**
1. `valor_a_facturar > 0` (valores de venta definidos)
2. `valor_cancelado > 0` (valores de costos definidos)
3. Todos los vehículos tienen operacional subido
4. No existe una prefactura previa

❌ **Errores posibles:**
- `400 - "La solicitud no tiene valores de venta definidos"`
- `400 - "La solicitud no tiene valores de costos definidos"`
- `400 - "Faltan operacionales para los siguientes vehículos: ABC123, XYZ789"`
- `400 - "Ya existe una prefactura generada para esta solicitud"`

### Para Aprobar Prefactura

✅ **Requisitos:**
1. Existe una prefactura generada
2. La prefactura no está aprobada

❌ **Errores posibles:**
- `400 - "No existe una prefactura generada para esta solicitud"`
- `400 - "La prefactura ya fue aprobada"`

### Para Marcar como Lista para Facturación

✅ **Requisitos:**
1. La prefactura está aprobada (`prefactura.aprobada === true`)

❌ **Errores posibles:**
- `400 - "La prefactura debe estar aprobada antes de marcar como lista para facturación"`

---

## 🔍 Cómo Verificar el Estado del Flujo

### Verificar si está lista para contabilidad

```typescript
// Una solicitud está lista para contabilidad cuando tiene venta y costo definidos
// (NO requiere que el servicio esté finalizado)
const isReadyForAccounting = 
    solicitud.valor_a_facturar > 0 &&
    solicitud.valor_cancelado > 0;
```

### Verificar si todos los operacionales están completos

```http
GET /api/v1/solicitudes/:id/verify-operationals
```

### Verificar el estado actual

```typescript
// Ver el estado del flujo de contabilidad
const accountingStatus = solicitud.accounting_status;

// Estados posibles:
// - "no_iniciado"
// - "pendiente_operacional"
// - "operacional_completo"
// - "prefactura_pendiente"
// - "prefactura_aprobada"
// - "listo_para_facturacion"
// - "facturado"
```

---

## 📋 Ejemplo de Flujo Completo

### Paso 1: Definir Valores de Venta y Costos

**Nota**: Este paso puede realizarse en cualquier momento (antes, durante o después del servicio).

```http
# 1. Establecer valores de venta (coordinador comercial)
PUT /api/v1/solicitudes/:id/set-financial-values
Body: {
  "valor_a_facturar": 1000000
}

# 2. Establecer valores de costos (coordinador operador)
PUT /api/v1/solicitudes/:id/set-costs
Body: {
  "valor_cancelado": 500000
}

# Estado resultante: accounting_status = "pendiente_operacional"
# (Se actualiza automáticamente cuando ambos valores están definidos)
```

**Importante**: El orden puede variar (primero costos, luego venta, o viceversa). El estado se actualiza cuando ambos están definidos.

### Paso 2: Subir Operacionales

```http
# Subir operacional para cada vehículo
POST /vehicles/operational-bills
FormData: {
  vehicle_id: "64f8a1b2c3d4e5f6g7h8i9j0",
  solicitud_id: "64f8a1b2c3d4e5f6g7h8i9j1",  // ← IMPORTANTE: vincular a solicitud
  bills: [
    {
      type_bill: "fuel",
      value: 50000,
      description: "Combustible"
    }
  ],
  bills[0][media_support]: [archivo]
}

# Estado resultante: accounting_status = "operacional_completo" (automático cuando todos están completos)
```

### Paso 3: Generar Prefactura

```http
POST /api/v1/solicitudes/:id/generate-prefactura
Body: {
  "prefactura_numero": "PREF-2024-001"
}

# Estado resultante: accounting_status = "prefactura_pendiente"
```

### Paso 4: Aprobar Prefactura

```http
PUT /api/v1/solicitudes/:id/approve-prefactura
Body: {
  "notas": "Prefactura revisada y aprobada"
}

# Estado resultante: accounting_status = "prefactura_aprobada"
```

### Paso 5: Marcar como Lista para Facturación

```http
PUT /api/v1/solicitudes/:id/mark-ready-for-billing

# Estado resultante: accounting_status = "listo_para_facturacion"
```

### Paso 6: Cargar en Componente de Facturación

**Nota**: Este paso se hace en el componente de facturación externo. El backend solo marca el estado como `"listo_para_facturacion"` para indicar que está disponible para facturar.

---

## 🎨 Interfaz de Usuario Recomendada

### Vista de Estado de Contabilidad

```typescript
// Componente de estado visual
function AccountingStatusBadge({ status }: { status: string }) {
  const statusConfig = {
    "no_iniciado": { label: "No iniciado", color: "gray" },
    "pendiente_operacional": { label: "Pendiente Operacional", color: "yellow" },
    "operacional_completo": { label: "Operacional Completo", color: "blue" },
    "prefactura_pendiente": { label: "Prefactura Pendiente", color: "orange" },
    "prefactura_aprobada": { label: "Prefactura Aprobada", color: "green" },
    "listo_para_facturacion": { label: "Listo para Facturación", color: "purple" },
    "facturado": { label: "Facturado", color: "dark-green" }
  };
  
  const config = statusConfig[status] || statusConfig["no_iniciado"];
  return <Badge color={config.color}>{config.label}</Badge>;
}
```

### Botones de Acción según Estado

```typescript
function AccountingActions({ solicitud }: { solicitud: BitacoraSolicitud }) {
  const { accounting_status, prefactura } = solicitud;
  
  switch (accounting_status) {
    case "pendiente_operacional":
      return (
        <Button onClick={verifyOperationals}>
          Verificar Operacionales
        </Button>
      );
      
    case "operacional_completo":
      return (
        <Button onClick={generatePrefactura}>
          Generar Prefactura
        </Button>
      );
      
    case "prefactura_pendiente":
      return (
        <>
          <Button onClick={approvePrefactura} variant="success">
            Aprobar Prefactura
          </Button>
          <Button onClick={rejectPrefactura} variant="danger">
            Rechazar Prefactura
          </Button>
        </>
      );
      
    case "prefactura_aprobada":
      return (
        <Button onClick={markReadyForBilling}>
          Marcar como Lista para Facturación
        </Button>
      );
      
    case "listo_para_facturacion":
      return (
        <Alert>
          ✅ Solicitud lista para cargar en componente de facturación
        </Alert>
      );
      
    default:
      return null;
  }
}
```

---

## ⚠️ Consideraciones Importantes

### 1. Subir Operacionales

**IMPORTANTE**: Al subir operacionales, siempre incluir `solicitud_id` en el body para vincularlos:

```typescript
// Correcto ✅
POST /vehicles/operational-bills
FormData: {
  vehicle_id: "...",
  solicitud_id: "...",  // ← VINCULAR A LA SOLICITUD
  bills: [...]
}

// Incorrecto ❌
POST /vehicles/operational-bills
FormData: {
  vehicle_id: "...",
  // Sin solicitud_id - NO se actualizará el estado automáticamente
  bills: [...]
}
```

### 2. Verificación de Operacionales

Antes de generar prefactura, siempre verificar:

```typescript
// 1. Verificar operacionales
const check = await fetch(`/api/v1/solicitudes/${id}/verify-operationals`);

if (!check.data.all_complete) {
  // Mostrar lista de vehículos que faltan
  showMissingOperationals(check.data.missing_operationals);
  return;
}

// 2. Si todos están completos, generar prefactura
await generatePrefactura();
```

### 3. Estados y Validaciones

- **No se puede generar prefactura** sin operacionales completos
- **No se puede aprobar prefactura** si no está generada
- **No se puede marcar como lista para facturación** sin prefactura aprobada
- El estado se actualiza **automáticamente** cuando se suben operacionales

### 4. Prefactura Rechazada

Si se rechaza una prefactura:
- El estado vuelve a `"operacional_completo"`
- Se puede generar una nueva prefactura
- La prefactura anterior se mantiene en el historial (con `rechazada_por` y `rechazada_fecha`)

---

## 📊 Tipos TypeScript Actualizados

### Interfaz BitacoraSolicitud

```typescript
interface BitacoraSolicitud {
  // ... campos existentes ...
  
  // Nuevos campos
  accounting_status?: 
    | "no_iniciado" 
    | "pendiente_operacional" 
    | "operacional_completo" 
    | "prefactura_pendiente" 
    | "prefactura_aprobada" 
    | "listo_para_facturacion" 
    | "facturado";
    
  prefactura?: {
    numero?: string;
    fecha?: Date;
    aprobada?: boolean;
    aprobada_por?: ObjectId;
    aprobada_fecha?: Date;
    rechazada_por?: ObjectId;
    rechazada_fecha?: Date;
    notas?: string;
  };
}
```

---

## 🔍 Endpoints de Consulta

### Obtener Solicitud con Estado de Contabilidad

```http
GET /api/v1/solicitudes/:id
```

**Respuesta incluye:**
```json
{
  "message": "Solicitud obtenida correctamente",
  "data": {
    "_id": "...",
    "accounting_status": "prefactura_pendiente",
    "prefactura": {
      "numero": "PREF-2024-001",
      "fecha": "2024-01-15T10:30:00.000Z",
      "aprobada": false
    },
    "valor_a_facturar": 1000000,
    "valor_cancelado": 500000,
    "service_status": "finished",
    ...
  }
}
```

### Filtrar Solicitudes por Estado de Contabilidad

```http
GET /api/v1/solicitudes?accounting_status=prefactura_pendiente
```

**Query params disponibles:**
- `accounting_status` - Filtrar por estado de contabilidad

---

## 📌 Checklist para el Frontend

- [ ] Actualizar tipos TypeScript de `BitacoraSolicitud` (agregar `accounting_status` y `prefactura`)
- [ ] Crear componente visual para mostrar el estado de contabilidad
- [ ] Implementar botones de acción según el estado actual
- [ ] Crear formulario para generar prefactura
- [ ] Crear formulario para aprobar/rechazar prefactura
- [ ] Implementar verificación de operacionales antes de generar prefactura
- [ ] Mostrar lista de vehículos que faltan operacional
- [ ] Validar que se incluya `solicitud_id` al subir operacionales
- [ ] Agregar filtros de búsqueda por `accounting_status`
- [ ] Mostrar información de prefactura en la vista de solicitud
- [ ] Implementar flujo completo de contabilidad
- [ ] Probar todos los estados y transiciones
- [ ] Manejar errores de validación

---

## 🐛 Manejo de Errores

### Errores Comunes

#### 1. Intentar generar prefactura sin operacionales

```json
{
  "ok": false,
  "message": "Faltan operacionales para los siguientes vehículos: ABC123, XYZ789"
}
```

**Solución**: Subir operacionales para los vehículos faltantes antes de generar prefactura.

#### 2. Intentar aprobar prefactura que no existe

```json
{
  "ok": false,
  "message": "No existe una prefactura generada para esta solicitud"
}
```

**Solución**: Generar prefactura primero.

#### 3. Intentar marcar como lista sin prefactura aprobada

```json
{
  "ok": false,
  "message": "La prefactura debe estar aprobada antes de marcar como lista para facturación"
}
```

**Solución**: Aprobar la prefactura primero.

---

## 📞 Soporte

Si tienes dudas sobre estos cambios, contacta al equipo de backend.

**Última actualización**: Enero 2024
