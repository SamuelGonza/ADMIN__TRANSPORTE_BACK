# 📋 Cambios en Contratos y Clientes - Actualización Frontend

Este documento describe todos los cambios realizados en los endpoints de contratos y clientes que el frontend debe implementar.

---

## 🔴 CAMBIOS IMPORTANTES

### 1. **Eliminado tipo "ocasional" de contratos**
   - ❌ **Ya no existe**: `tipo_contrato: "ocasional"`
   - ✅ **Solo existe**: `tipo_contrato: "fijo"` (siempre con presupuesto)
   - **Razón**: Un servicio sin contrato es simplemente un "servicio ocasional", no necesita un contrato "ocasional"

### 2. **Contratos se crean junto con el cliente**
   - ✅ Se puede crear un contrato opcional al crear un cliente
   - ✅ Ya no es necesario crear el contrato por separado (aunque sigue siendo posible)

### 3. **Las solicitudes NO requieren contrato**
   - ✅ El campo `contract_id` es completamente opcional en las solicitudes
   - ✅ Si no hay contrato, es simplemente un servicio ocasional

---

## 📝 CAMBIOS DETALLADOS POR ENDPOINT

### 1. Crear Cliente (`POST /api/v1/clients`)

#### ✅ **NUEVO**: Se puede crear contrato junto con el cliente

**Antes:**
```json
{
  "name": "Empresa Cliente S.A.S",
  "contact_name": "Juan Pérez",
  "contact_phone": "3001234567",
  "email": "contacto@empresacliente.com"
}
```

**Ahora (con contrato opcional):**
```json
{
  "name": "Empresa Cliente S.A.S",
  "contact_name": "Juan Pérez",
  "contact_phone": "3001234567",
  "email": "contacto@empresacliente.com",
  "contract": {
    "periodo_presupuesto": "anio",
    "valor_presupuesto": 50000000,
    "cobro": {
      "modo_default": "por_hora",
      "por_hora": 50000,
      "por_kilometro": 2000
    },
    "notes": "Contrato anual 2024"
  }
}
```

**Notas:**
- El campo `contract` es **opcional**
- Si no se envía `contract`, el cliente se crea sin contrato (servicios ocasionales)
- Si se envía `contract`, se crea el cliente y su contrato en una sola operación
- El contrato siempre será tipo "fijo" (no se especifica, se asume automáticamente)

**Respuesta:**
```json
{
  "message": "Cliente y contrato creados exitosamente" // o "Cliente creado exitosamente" si no hay contrato
}
```

---

### 2. Crear Contrato (`POST /api/v1/contracts`)

#### ❌ **CAMBIADO**: Ya no se acepta `tipo_contrato: "ocasional"`

**Antes:**
```json
{
  "client_id": "64f8a1b2c3d4e5f6g7h8i9j0",
  "tipo_contrato": "ocasional",  // ❌ Ya no existe
  "cobro": { ... }
}
```

**Ahora:**
```json
{
  "client_id": "64f8a1b2c3d4e5f6g7h8i9j0",
  "periodo_presupuesto": "anio",  // ✅ Requerido
  "valor_presupuesto": 50000000,  // ✅ Requerido
  "cobro": {
    "modo_default": "por_hora",
    "por_hora": 50000,
    "por_kilometro": 2000
  },
  "notes": "Contrato anual 2024"
}
```

**Cambios:**
- ❌ **Eliminado**: Campo `tipo_contrato` (siempre es "fijo" automáticamente)
- ✅ **Requerido**: `periodo_presupuesto` (antes era condicional)
- ✅ **Requerido**: `valor_presupuesto` (antes era condicional)

**Nota**: Este endpoint sigue disponible si necesitas crear un contrato para un cliente existente que no tiene contrato.

---

### 3. Actualizar Contrato (`PUT /api/v1/contracts/:id`)

#### ❌ **CAMBIADO**: Ya no se puede cambiar `tipo_contrato`

**Antes:**
```json
{
  "tipo_contrato": "ocasional",  // ❌ Ya no se acepta
  "valor_presupuesto": 60000000
}
```

**Ahora:**
```json
{
  "periodo_presupuesto": "mes",
  "valor_presupuesto": 60000000,
  "cobro": {
    "modo_default": "por_kilometro",
    "por_kilometro": 2500
  },
  "is_active": true,
  "notes": "Actualización de presupuesto"
}
```

**Cambios:**
- ❌ **Eliminado**: Campo `tipo_contrato` del payload (no se puede cambiar, siempre es "fijo")

---

### 4. Crear Solicitud (`POST /api/v1/solicitudes/client`)

#### ✅ **SIN CAMBIOS**: El contrato sigue siendo opcional

**Ejemplo sin contrato (servicio ocasional):**
```json
{
  "fecha": "2024-02-15",
  "hora_inicio": "08:00",
  "origen": "Bogotá",
  "destino": "Medellín",
  "n_pasajeros": 25
}
```

**Ejemplo con contrato (si el cliente tiene contrato y se quiere usar):**
```json
{
  "fecha": "2024-02-15",
  "hora_inicio": "08:00",
  "origen": "Bogotá",
  "destino": "Medellín",
  "n_pasajeros": 25,
  "bitacora_id": "64f8a1b2c3d4e5f6g7h8i9j0"  // Opcional: si no se envía, se busca/crea automáticamente
}
```

**Nota**: El `bitacora_id` es opcional y se busca automáticamente según la fecha del servicio.

---

### 5. Aceptar Solicitud (`POST /api/v1/solicitudes/:id/accept`)

#### ✅ **SIN CAMBIOS**: El contrato sigue siendo opcional

**Ejemplo sin contrato (servicio ocasional):**
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
  "porcentaje_utilidad": 20
}
```

**Ejemplo con contrato (si el cliente tiene contrato y se quiere usar):**
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
  "contract_id": "64f8a1b2c3d4e5f6g7h8i9j1",  // Opcional
  "contract_charge_mode": "within_contract",  // Opcional
  "contract_charge_amount": 15000000           // Opcional
}
```

---

### 6. Crear Solicitud como Coordinador (`POST /api/v1/solicitudes/coordinator`)

#### ✅ **SIN CAMBIOS**: El contrato sigue siendo opcional

**Ejemplo:**
```json
{
  "bitacora_id": "64f8a1b2c3d4e5f6g7h8i9j0",
  "cliente_id": "64f8a1b2c3d4e5f6g7h8i9j0",
  "he": "HE-2024-001",
  "empresa": "national",
  "fecha": "2024-02-15",
  "hora_inicio": "08:00",
  "origen": "Bogotá",
  "destino": "Medellín",
  "n_pasajeros": 25,
  "placa": "ABC123",
  "conductor_id": "64f8a1b2c3d4e5f6g7h8i9j6",
  "nombre_cuenta_cobro": "Servicio Ejecutivo",
  "valor_cancelado": 0,
  "valor_a_facturar": 15000000,
  "utilidad": 3000000,
  "porcentaje_utilidad": 20,
  "contract_id": "64f8a1b2c3d4e5f6g7h8i9j1",  // Opcional
  "contract_charge_mode": "within_contract",  // Opcional
  "contract_charge_amount": 15000000           // Opcional
}
```

---

## 🔄 MIGRACIÓN DEL FRONTEND

### Paso 1: Actualizar formulario de creación de cliente

**Antes:**
```typescript
interface CreateClientRequest {
  name: string;
  contact_name: string;
  contact_phone: string;
  email: string;
  company_id?: string;
}
```

**Ahora:**
```typescript
interface CreateClientRequest {
  name: string;
  contact_name: string;
  contact_phone: string;
  email: string;
  company_id?: string;
  contract?: {  // ✅ NUEVO: Opcional
    periodo_presupuesto: "anio" | "mes" | "semana" | "dia";
    valor_presupuesto: number;
    cobro?: {
      modo_default?: "por_hora" | "por_kilometro" | "por_distancia" | "tarifa_amva";
      por_hora?: number;
      por_kilometro?: number;
      por_distancia?: number;
      tarifa_amva?: number;
    };
    notes?: string;
  };
}
```

### Paso 2: Actualizar formulario de creación de contrato

**Antes:**
```typescript
interface CreateContractRequest {
  client_id: string;
  tipo_contrato: "fijo" | "ocasional";  // ❌ Eliminar "ocasional"
  periodo_presupuesto?: string;  // Era condicional
  valor_presupuesto?: number | null;  // Era condicional
  cobro?: { ... };
  notes?: string;
}
```

**Ahora:**
```typescript
interface CreateContractRequest {
  client_id: string;
  // ❌ Eliminado: tipo_contrato (siempre es "fijo")
  periodo_presupuesto: "anio" | "mes" | "semana" | "dia";  // ✅ Ahora requerido
  valor_presupuesto: number;  // ✅ Ahora requerido
  cobro?: {
    modo_default?: "por_hora" | "por_kilometro" | "por_distancia" | "tarifa_amva";
    por_hora?: number;
    por_kilometro?: number;
    por_distancia?: number;
    tarifa_amva?: number;
  };
  notes?: string;
}
```

### Paso 3: Actualizar formulario de actualización de contrato

**Antes:**
```typescript
interface UpdateContractRequest {
  tipo_contrato?: "fijo" | "ocasional";  // ❌ Eliminar
  periodo_presupuesto?: string;
  valor_presupuesto?: number | null;
  cobro?: { ... };
  is_active?: boolean;
  notes?: string;
}
```

**Ahora:**
```typescript
interface UpdateContractRequest {
  // ❌ Eliminado: tipo_contrato
  periodo_presupuesto?: "anio" | "mes" | "semana" | "dia";
  valor_presupuesto?: number | null;
  cobro?: {
    modo_default?: "por_hora" | "por_kilometro" | "por_distancia" | "tarifa_amva";
    por_hora?: number;
    por_kilometro?: number;
    por_distancia?: number;
    tarifa_amva?: number;
  };
  is_active?: boolean;
  notes?: string;
}
```

### Paso 4: Actualizar tipos TypeScript

**Actualizar `ContractType`:**
```typescript
// ❌ Antes
type ContractType = "fijo" | "ocasional";

// ✅ Ahora
type ContractType = "fijo"; // Solo contratos fijos con presupuesto
```

**Actualizar interfaz `Contract`:**
```typescript
interface Contract {
  company_id: string;
  client_id: string;
  tipo_contrato: "fijo";  // ✅ Siempre "fijo", no puede ser "ocasional"
  periodo_presupuesto: "anio" | "mes" | "semana" | "dia";
  valor_presupuesto: number | null;
  valor_consumido: number;
  cobro?: { ... };
  historico: ContractHistoryEvent[];
  is_active: boolean;
  created: Date;
  created_by?: string;
}
```

---

## 📋 CHECKLIST PARA EL FRONTEND

### ✅ Formulario de Creación de Cliente
- [ ] Agregar sección opcional para crear contrato junto con el cliente
- [ ] Mostrar campos de contrato solo si el usuario quiere crear uno
- [ ] Validar que si se crea contrato, `periodo_presupuesto` y `valor_presupuesto` sean requeridos
- [ ] Actualizar mensaje de éxito según si se creó contrato o no

### ✅ Formulario de Creación de Contrato
- [ ] Eliminar selector de `tipo_contrato` (ya no existe "ocasional")
- [ ] Hacer `periodo_presupuesto` requerido (antes era condicional)
- [ ] Hacer `valor_presupuesto` requerido (antes era condicional)
- [ ] Actualizar validaciones del formulario

### ✅ Formulario de Actualización de Contrato
- [ ] Eliminar campo `tipo_contrato` del formulario
- [ ] Mantener todos los demás campos

### ✅ Listado de Contratos
- [ ] Eliminar filtro o columna de "tipo_contrato" si existe
- [ ] Mostrar solo contratos tipo "fijo" (todos los contratos)

### ✅ Formulario de Solicitudes
- [ ] Asegurar que `contract_id` sea opcional
- [ ] Mostrar mensaje claro: "Servicio ocasional" si no hay contrato
- [ ] Mostrar información del contrato si el cliente tiene uno

### ✅ Lógica de Negocio
- [ ] Actualizar lógica: Cliente sin contrato = servicios ocasionales
- [ ] Actualizar lógica: Cliente con contrato = puede usar presupuesto
- [ ] Eliminar cualquier referencia a contratos "ocasionales"

---

## 🎯 EJEMPLOS DE USO

### Ejemplo 1: Crear cliente sin contrato (servicios ocasionales)
```typescript
const response = await fetch('/api/v1/clients', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: "Empresa Ocasional S.A.S",
    contact_name: "María García",
    contact_phone: "3001234567",
    email: "maria@empresaocasional.com"
    // Sin campo "contract" = cliente sin contrato
  })
});
```

### Ejemplo 2: Crear cliente con contrato
```typescript
const response = await fetch('/api/v1/clients', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: "Empresa Contrato S.A.S",
    contact_name: "Juan Pérez",
    contact_phone: "3001234567",
    email: "juan@empresacontrato.com",
    contract: {  // ✅ Crear contrato junto con el cliente
      periodo_presupuesto: "anio",
      valor_presupuesto: 50000000,
      cobro: {
        modo_default: "por_hora",
        por_hora: 50000
      },
      notes: "Contrato anual 2024"
    }
  })
});
```

### Ejemplo 3: Crear contrato para cliente existente
```typescript
const response = await fetch('/api/v1/contracts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    client_id: "64f8a1b2c3d4e5f6g7h8i9j0",
    // ❌ Ya no se envía tipo_contrato
    periodo_presupuesto: "anio",  // ✅ Requerido
    valor_presupuesto: 50000000,   // ✅ Requerido
    cobro: {
      modo_default: "por_hora",
      por_hora: 50000
    }
  })
});
```

---

## ⚠️ NOTAS IMPORTANTES

1. **Compatibilidad hacia atrás**: Los contratos existentes de tipo "ocasional" en la base de datos seguirán funcionando, pero no se pueden crear nuevos.

2. **Servicios ocasionales**: Un servicio sin contrato es simplemente un "servicio ocasional". No necesita un contrato especial.

3. **Crear contrato junto con cliente**: Es la forma recomendada, pero también puedes crear el contrato por separado si el cliente ya existe.

4. **Validaciones**: El backend ahora valida que todos los contratos tengan `periodo_presupuesto` y `valor_presupuesto` requeridos.

---

**Última actualización**: 2024-01-15

