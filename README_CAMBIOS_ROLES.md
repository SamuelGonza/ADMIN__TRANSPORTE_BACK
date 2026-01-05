# 📋 Cambios en Roles y Flujo de Solicitudes

## 🎯 Resumen de Cambios

Este documento detalla todos los cambios realizados en el sistema de roles y el flujo de solicitudes. **Es importante que el frontend se actualice según estas especificaciones.**

---

## 🔄 Cambios en Roles

### Roles Eliminados
- ❌ `"operador"` - **ELIMINADO** (sus funciones ahora pertenecen a `"contabilidad"`)

### Roles Renombrados
- `"comercial"` → `"coordinador_comercial"`
- `"coordinador"` → `"coordinador_operador"`

### Nuevos Roles Disponibles
```typescript
export type UserRoles = 
  | "superadmon" 
  | "admin" 
  | "coordinador_operador"      // ← NUEVO (antes "coordinador")
  | "coordinador_comercial"      // ← NUEVO (antes "comercial")
  | "contabilidad"               // ← Ahora incluye funciones del antiguo "operador"
  | "conductor" 
  | "cliente"
```

---

## 📝 Cambios en el Modelo de Solicitudes

### Nuevos Campos Agregados

#### 1. `contacto_phone` (string, opcional)
- **Descripción**: Número de teléfono del contacto del cliente
- **Uso**: El cliente puede proporcionar este campo al crear una solicitud
- **Ejemplo**: `"3001234567"`

#### 2. `last_modified_by` (ObjectId, opcional)
- **Descripción**: Referencia al usuario que hizo la última modificación a la solicitud
- **Uso**: Se actualiza automáticamente cuando cualquier coordinador modifica la solicitud
- **Tipo**: Referencia a `User`

### Nuevos Estados en `service_status`

Se agregó un nuevo estado al enum:

```typescript
service_status: 
  | "pendiente_de_asignacion"  // ← NUEVO: Estado inicial cuando cliente crea solicitud
  | "sin_asignacion"            // (mantenido para compatibilidad)
  | "not-started" 
  | "started" 
  | "finished"
```

**Importante**: Cuando un cliente crea una solicitud, el estado inicial es `"pendiente_de_asignacion"`.

---

## 🔐 Permisos y Visualización por Rol

### Coordinador Comercial (`coordinador_comercial`)

**Puede ver:**
- ✅ Valores de venta (`valor_a_facturar`, `n_factura`, `fecha_factura`)
- ✅ Utilidad y porcentaje de utilidad
- ✅ Todos los demás campos de la solicitud

**NO puede ver:**
- ❌ Valores de costos (`valor_cancelado`, `doc_soporte`, `fecha_cancelado`, `n_egreso`)

**Puede hacer:**
- ✅ Asignar valores de venta (`valor_a_facturar`)
- ✅ Elegir contratos
- ✅ Crear solicitudes
- ✅ Aceptar/rechazar solicitudes
- ✅ Ver todas las solicitudes

### Coordinador Operador (`coordinador_operador`)

**Puede ver:**
- ✅ Valores de costos (`valor_cancelado`, `doc_soporte`, `fecha_cancelado`, `n_egreso`)
- ✅ Utilidad y porcentaje de utilidad
- ✅ Todos los demás campos de la solicitud

**NO puede ver:**
- ❌ Valores de venta (`valor_a_facturar`, `n_factura`, `fecha_factura`)

**Puede hacer:**
- ✅ Asignar valores de costos (`valor_cancelado`)
- ✅ **Iniciar servicios** (solo este rol puede hacerlo)
- ✅ Elegir contratos
- ✅ Crear solicitudes
- ✅ Aceptar/rechazar solicitudes
- ✅ Ver todas las solicitudes

### Contabilidad (`contabilidad`)

**Puede ver:**
- ✅ Todos los campos (sin restricciones)
- ✅ Valores de venta y costos
- ✅ Utilidad completa

**Puede hacer:**
- ✅ Todas las funciones que antes tenía `"operador"`
- ✅ Ver reportes operacionales y preoperacionales
- ✅ Gestionar gastos operacionales

---

## 🆕 Nuevos Endpoints

### 1. Establecer Valores de Costos

```http
PUT /api/v1/solicitudes/:id/set-costs
```

**Autenticación**: `CoordinadorAuth` (solo `coordinador_operador`, `admin`, `superadmon`)

**Body:**
```json
{
  "valor_cancelado": 500000
}
```

**Respuesta exitosa:**
```json
{
  "message": "Valores de costos establecidos correctamente",
  "data": {
    "message": "Valores de costos establecidos exitosamente",
    "solicitud": { ... }
  }
}
```

**Descripción**: Permite al coordinador operador establecer el valor de costos (`valor_cancelado`). La utilidad se recalcula automáticamente si ya hay valores de venta establecidos.

---

## 🔧 Endpoints Modificados

### 1. Crear Solicitud (Cliente)

```http
POST /api/v1/solicitudes/client
```

**Cambios:**
- ✅ Ahora acepta `contacto` y `contacto_phone` en el body (opcionales)
- ✅ El estado inicial es `"pendiente_de_asignacion"` (antes era `"sin_asignacion"`)

**Body actualizado:**
```json
{
  "fecha": "2024-01-15T08:00:00Z",
  "hora_inicio": "08:00",
  "origen": "Medellín",
  "destino": "Bogotá",
  "n_pasajeros": 20,
  "contacto": "Juan Pérez",           // ← OPCIONAL (si no se envía, se usa el del cliente)
  "contacto_phone": "3001234567",     // ← NUEVO (opcional)
  "requested_passengers": 20,         // opcional
  "estimated_km": 400,                // opcional
  "estimated_hours": 6                // opcional
}
```

**Respuesta:**
```json
{
  "message": "Solicitud creada exitosamente"
}
```

**Estado inicial**: `status: "pending"`, `service_status: "pendiente_de_asignacion"`

---

### 2. Establecer Valores Financieros (Coordinador Comercial)

```http
PUT /api/v1/solicitudes/:id/set-financial-values
```

**Cambios:**
- ❌ Ya NO acepta `valor_cancelado` en el body
- ✅ Solo acepta `valor_a_facturar` (valores de venta)

**Autenticación**: `ComercialAuth` (solo `coordinador_comercial`, `admin`, `superadmon`)

**Body actualizado:**
```json
{
  "valor_a_facturar": 1000000  // Solo valores de venta
}
```

**Antes:**
```json
{
  "valor_a_facturar": 1000000,
  "valor_cancelado": 500000     // ← YA NO SE ACEPTA
}
```

**Respuesta:**
```json
{
  "message": "Valores de venta establecidos correctamente",
  "data": {
    "message": "Valores de venta establecidos exitosamente",
    "solicitud": { ... }
  }
}
```

---

### 3. Iniciar Servicio

```http
PUT /api/v1/solicitudes/:id/start
```

**Cambios importantes:**
- ✅ **Solo el coordinador operador puede iniciar el servicio**
- ✅ Cambió la autenticación de `ConductorAuth` a `CoordinadorAuth`
- ✅ Acepta estados `"not-started"` o `"pendiente_de_asignacion"` para iniciar

**Autenticación**: `CoordinadorAuth` (solo `coordinador_operador`, `admin`, `superadmon`)

**Respuesta de error si no es coordinador operador:**
```json
{
  "ok": false,
  "message": "Solo el coordinador operador puede iniciar el servicio"
}
```

**Respuesta exitosa:**
```json
{
  "message": "Servicio iniciado correctamente",
  "data": {
    "message": "Servicio iniciado exitosamente",
    "solicitud": { ... }
  }
}
```

---

### 4. Obtener Solicitud por ID

```http
GET /api/v1/solicitudes/:id
```

**Cambios:**
- ✅ Aplica filtros de visualización según el rol del usuario
- ✅ Coordinador comercial: oculta campos de costos
- ✅ Coordinador operador: oculta campos de venta

**Ejemplo de respuesta para coordinador comercial:**
```json
{
  "message": "Solicitud obtenida correctamente",
  "data": {
    "_id": "...",
    "valor_a_facturar": 1000000,      // ✅ Visible
    "n_factura": "FAC-001",            // ✅ Visible
    "fecha_factura": "2024-01-15",    // ✅ Visible
    // valor_cancelado: NO aparece     // ❌ Oculto
    // doc_soporte: NO aparece         // ❌ Oculto
    // fecha_cancelado: NO aparece     // ❌ Oculto
    // n_egreso: NO aparece            // ❌ Oculto
    ...
  }
}
```

**Ejemplo de respuesta para coordinador operador:**
```json
{
  "message": "Solicitud obtenida correctamente",
  "data": {
    "_id": "...",
    "valor_cancelado": 500000,         // ✅ Visible
    "doc_soporte": "DOC-001",          // ✅ Visible
    "fecha_cancelado": "2024-01-15",  // ✅ Visible
    "n_egreso": "EGR-001",            // ✅ Visible
    // valor_a_facturar: NO aparece    // ❌ Oculto
    // n_factura: NO aparece           // ❌ Oculto
    // fecha_factura: NO aparece       // ❌ Oculto
    ...
  }
}
```

---

### 5. Obtener Todas las Solicitudes

```http
GET /api/v1/solicitudes
```

**Cambios:**
- ✅ Aplica los mismos filtros de visualización según el rol
- ✅ Acepta el nuevo estado `"pendiente_de_asignacion"` en el filtro `service_status`

**Query params:**
```
?service_status=pendiente_de_asignacion  // ← NUEVO estado disponible
```

---

## 🔄 Flujo de Trabajo Actualizado

### Flujo 1: Cliente Crea Solicitud

```
1. Cliente crea solicitud
   ├─ Campos permitidos:
   │  ├─ fecha, hora_inicio, origen, destino, n_pasajeros
   │  ├─ contacto (opcional, si no se envía usa el del cliente)
   │  ├─ contacto_phone (opcional, nuevo)
   │  └─ estimated_km, estimated_hours (opcionales)
   │
   ├─ Estado inicial:
   │  ├─ status: "pending"
   │  └─ service_status: "pendiente_de_asignacion"  ← NUEVO
   │
   └─ Cliente se asigna automáticamente
      └─ last_modified_by: client_id

2. Coordinador Comercial o Operador acepta
   ├─ Asigna vehículo y conductor
   ├─ Puede elegir contrato
   ├─ Estado cambia a:
   │  ├─ status: "accepted"
   │  └─ service_status: "not-started"
   │
   └─ last_modified_by: coordinador_id

3. Coordinador Comercial asigna valores de venta
   ├─ PUT /solicitudes/:id/set-financial-values
   ├─ Body: { "valor_a_facturar": 1000000 }
   └─ last_modified_by: coordinador_comercial_id

4. Coordinador Operador asigna costos
   ├─ PUT /solicitudes/:id/set-costs
   ├─ Body: { "valor_cancelado": 500000 }
   └─ last_modified_by: coordinador_operador_id

5. Coordinador Operador inicia el servicio
   ├─ PUT /solicitudes/:id/start
   ├─ Solo coordinador_operador puede hacerlo
   ├─ Estado cambia a: service_status: "started"
   └─ last_modified_by: coordinador_operador_id
```

### Flujo 2: Coordinador Crea Solicitud

```
1. Coordinador Comercial o Operador crea solicitud
   ├─ Estado inicial:
   │  ├─ status: "accepted" (ya aprobada)
   │  └─ service_status: "not-started"
   │
   └─ last_modified_by: coordinador_id

2. Coordinador Comercial asigna valores de venta
   ├─ PUT /solicitudes/:id/set-financial-values
   └─ Coordinador Operador NO ve estos valores

3. Coordinador Operador asigna costos
   ├─ PUT /solicitudes/:id/set-costs
   └─ Coordinador Comercial NO ve estos valores

4. Coordinador Operador inicia el servicio
   ├─ PUT /solicitudes/:id/start
   └─ Solo coordinador_operador puede hacerlo
```

---

## 📊 Campos Ocultos por Rol

### Coordinador Comercial NO ve:
- `valor_cancelado`
- `doc_soporte`
- `fecha_cancelado`
- `n_egreso`

### Coordinador Operador NO ve:
- `valor_a_facturar`
- `n_factura`
- `fecha_factura`

### Contabilidad ve TODO:
- Todos los campos sin restricciones

---

## ⚠️ Consideraciones Importantes para el Frontend

### 1. Actualizar Tipos TypeScript

```typescript
// Antes
type UserRoles = "superadmon" | "admin" | "coordinador" | "comercial" | "contabilidad" | "operador" | "conductor" | "cliente"

// Ahora
type UserRoles = "superadmon" | "admin" | "coordinador_operador" | "coordinador_comercial" | "contabilidad" | "conductor" | "cliente"
```

### 2. Actualizar Estados de Solicitud

```typescript
// Agregar nuevo estado
type ServiceStatus = 
  | "pendiente_de_asignacion"  // ← NUEVO
  | "sin_asignacion"
  | "not-started"
  | "started"
  | "finished"
```

### 3. Actualizar Interfaz de Solicitud

```typescript
interface BitacoraSolicitud {
  // ... campos existentes ...
  
  contacto_phone?: string;        // ← NUEVO
  last_modified_by?: ObjectId;     // ← NUEVO
  
  service_status: 
    | "pendiente_de_asignacion"   // ← NUEVO
    | "sin_asignacion"
    | "not-started"
    | "started"
    | "finished";
}
```

### 4. Manejar Permisos de Visualización

```typescript
// Ejemplo: Ocultar campos según el rol
function getVisibleFields(userRole: UserRoles) {
  if (userRole === "coordinador_comercial") {
    // Ocultar: valor_cancelado, doc_soporte, fecha_cancelado, n_egreso
    return {
      hideCosts: true,
      hideSales: false
    };
  }
  
  if (userRole === "coordinador_operador") {
    // Ocultar: valor_a_facturar, n_factura, fecha_factura
    return {
      hideCosts: false,
      hideSales: true
    };
  }
  
  return {
    hideCosts: false,
    hideSales: false
  };
}
```

### 5. Validar Permisos para Iniciar Servicio

```typescript
// Solo coordinador_operador puede iniciar servicios
function canStartService(userRole: UserRoles): boolean {
  return userRole === "coordinador_operador" 
      || userRole === "admin" 
      || userRole === "superadmon";
}
```

### 6. Actualizar Formularios

**Formulario de creación de solicitud (Cliente):**
- Agregar campo opcional `contacto_phone`
- Mostrar estado inicial como `"pendiente_de_asignacion"`

**Formulario de valores financieros (Coordinador Comercial):**
- Remover campo `valor_cancelado`
- Solo mostrar `valor_a_facturar`

**Nuevo formulario de costos (Coordinador Operador):**
- Crear nuevo formulario para `PUT /solicitudes/:id/set-costs`
- Solo mostrar campo `valor_cancelado`

### 7. Actualizar Middlewares de Autenticación

Asegúrate de que el frontend valide correctamente los nuevos roles:
- `coordinador_operador` para operaciones operativas
- `coordinador_comercial` para operaciones comerciales

---

## 🔍 Endpoints que Requieren Actualización en el Frontend

1. ✅ `POST /solicitudes/client` - Agregar `contacto_phone` opcional
2. ✅ `PUT /solicitudes/:id/set-financial-values` - Remover `valor_cancelado` del body
3. ✅ `PUT /solicitudes/:id/start` - Cambiar autenticación y validar rol
4. ✅ `GET /solicitudes/:id` - Manejar campos ocultos según rol
5. ✅ `GET /solicitudes` - Manejar campos ocultos según rol
6. ✅ `POST /users/register` - Actualizar ejemplo de rol en documentación

---

## 📌 Checklist para el Frontend

- [ ] Actualizar tipos TypeScript de `UserRoles`
- [ ] Actualizar tipos de `ServiceStatus` (agregar `"pendiente_de_asignacion"`)
- [ ] Actualizar interfaz `BitacoraSolicitud` (agregar `contacto_phone`, `last_modified_by`)
- [ ] Actualizar formulario de creación de solicitud (agregar `contacto_phone`)
- [ ] Actualizar formulario de valores financieros (remover `valor_cancelado`)
- [ ] Crear nuevo formulario para establecer costos
- [ ] Implementar lógica de ocultar campos según rol
- [ ] Actualizar validación de permisos para iniciar servicio
- [ ] Actualizar estados iniciales de solicitudes
- [ ] Actualizar filtros de búsqueda (agregar `"pendiente_de_asignacion"`)
- [ ] Actualizar middlewares de autenticación
- [ ] Probar flujo completo de creación y asignación
- [ ] Probar permisos de visualización por rol

---

## 🐛 Migración de Datos Existentes

**Nota importante**: Si hay datos existentes en la base de datos con los roles antiguos (`"comercial"`, `"coordinador"`, `"operador"`), será necesario ejecutar un script de migración para actualizar estos roles a los nuevos nombres.

**Roles a migrar:**
- `"comercial"` → `"coordinador_comercial"`
- `"coordinador"` → `"coordinador_operador"`
- `"operador"` → `"contabilidad"`

---

## 📞 Soporte

Si tienes dudas sobre estos cambios, contacta al equipo de backend.

**Última actualización**: Enero 2024
