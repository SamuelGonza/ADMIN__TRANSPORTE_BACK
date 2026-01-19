# Cambios en el Endpoint My Requests (Cliente)

## Resumen de Cambios

Se ha actualizado el endpoint `GET /api/v1/solicitudes/my-requests` para mejorar la estructura de datos y eliminar información duplicada que causaba overfetching.

**⚠️ ACCIÓN REQUERIDA EN FRONTEND:**
- **Tabla de "Mis Solicitudes":** Reemplazar el número de teléfono del conductor por el **nombre completo** (`full_name`)
- **Modal de detalle de solicitud:** Mostrar el **nombre completo del conductor** (`full_name`) que ahora está disponible en la respuesta

## Fecha de Cambio
**Fecha:** Enero 2026

## Endpoints Afectados
- `GET /api/v1/solicitudes/my-requests` - Lista de solicitudes del cliente
- `GET /api/v1/solicitudes/my-requests/:id` - Detalle de una solicitud del cliente

---

## Cambios Principales

### 1. Información del Conductor Ahora Incluye Nombre Completo

**Antes:**
```json
{
  "conductor": {
    "_id": "6940534c8751a39a09284bd1",
    "full_name": "Juan Pérez",
    "contact": {
      "phone": "3224445556"
    }
  },
  "conductor_phone": "3224445556"
}
```

**Ahora:**
```json
{
  "conductor_id": {
    "_id": "6940534c8751a39a09284bd1",
    "full_name": "Juan Pérez",
    "email": "conductor@example.com",
    "phone": "3224445556"
  }
}
```

**Nota:** El teléfono del conductor ahora solo está en `conductor_id.phone`, se eliminó el campo duplicado `conductor_phone`.

### 2. Eliminación de Campos Duplicados del Nivel Superior

Los siguientes campos **YA NO** aparecen en el nivel superior de la solicitud cuando hay `vehicle_assignments`:

- ❌ `placa`
- ❌ `flota`
- ❌ `conductor`
- ❌ `conductor_phone`
- ❌ `vehiculo_id`
- ❌ `tipo_vehiculo`

**Razón:** Esta información ahora está dentro de `vehicle_assignments`, evitando duplicación y overfetching.

### 3. Información de Vehículos y Conductores Ahora Solo en `vehicle_assignments`

Toda la información de vehículos y conductores debe obtenerse desde el array `vehicle_assignments`.

---

## Estructura de la Respuesta

### Antes (Estructura Antigua)

```json
{
  "_id": "6967fae609cb4883c64954c6",
  "he": "NAT-3",
  "fecha": "2026-01-15T05:00:00.000Z",
  
  // ❌ Campos duplicados en nivel superior
  "vehiculo_id": {
    "_id": "6940534d8751a39a09284bd7",
    "placa": "XYZ789",
    "type": "bus",
    "flota": "propio"
  },
  "placa": "XYZ789",
  "tipo_vehiculo": "bus",
  "flota": "propio",
  "conductor": {
    "_id": "6940534c8751a39a09284bd1",
    "full_name": "Juan Pérez",
    "contact": {
      "phone": "3224445556"
    }
  },
  "conductor_phone": "3224445556",
  
  // ✅ Información también en vehicle_assignments
  "vehicle_assignments": [
    {
      "vehiculo_id": {
        "_id": "6940534d8751a39a09284bd7",
        "placa": "XYZ789",
        "type": "bus",
        "flota": "propio"
      },
      "placa": "XYZ789",
      "conductor_id": {
        "_id": "6940534c8751a39a09284bd1",
        "full_name": "Juan Pérez"
      },
      "conductor_phone": "3224445556"
    }
  ]
}
```

### Ahora (Estructura Nueva)

```json
{
  "_id": "6967fae609cb4883c64954c6",
  "he": "NAT-3",
  "fecha": "2026-01-15T05:00:00.000Z",
  
  // ✅ Solo información única de la solicitud
  "n_pasajeros": 50,
  "cliente": {
    "_id": "6940534c8751a39a09284bd4",
    "name": "Corporación XYZ",
    "phone": "6049876543",
    "email": "cevacem917@imfaya.com"
  },
  
  // ✅ Toda la información de vehículos y conductores está aquí
  "vehicle_assignments": [
    {
      "vehiculo_id": {
        "_id": "6940534d8751a39a09284bd7",
        "placa": "XYZ789",
        "seats": 40,
        "type": "bus",
        "flota": "propio"
      },
      "placa": "XYZ789",
      "seats": 40,
      "assigned_passengers": 40,
      "conductor_id": {
        "_id": "6940534c8751a39a09284bd1",
        "full_name": "Juan Pérez",  // ✅ Nombre completo disponible
        "email": "conductor@example.com",
        "phone": "3224445556"  // ✅ Teléfono del conductor (único lugar donde aparece)
      },
      "contract_id": "69409f1d3203f5f1a9c64d76",
      "contract_charge_mode": "within_contract",
      "contract_charge_amount": 150000,
      "accounting": {
        "pagos": []
      }
    },
    {
      "vehiculo_id": {
        "_id": "6940534d8751a39a09284bd6",
        "placa": "ABC123",
        "seats": 15,
        "type": "van",
        "flota": "propio"
      },
      "placa": "ABC123",
      "seats": 15,
      "assigned_passengers": 10,
      "conductor_id": {
        "_id": "6940534c8751a39a09284bd0",
        "full_name": "María García",  // ✅ Nombre completo disponible
        "email": "maria@example.com",
        "phone": "3211112223"  // ✅ Teléfono del conductor
      },
      "contract_id": "69409f1d3203f5f1a9c64d76",
      "contract_charge_mode": "within_contract",
      "contract_charge_amount": 150000,
      "accounting": {
        "pagos": []
      }
    }
  ],
  
  // Resto de campos sin cambios
  "status": "accepted",
  "service_status": "finished"
}
```

---

## Guía de Migración para Frontend

### Paso 1: Actualizar Acceso a Información del Conductor

**Antes:**
```typescript
// ❌ No funcionará más
const conductorEmail = solicitud.conductor?.email;
const conductorPhone = solicitud.conductor_phone;
const conductorName = solicitud.conductor?.full_name; // Podía no estar disponible
```

**Ahora:**
```typescript
// ✅ Acceder desde vehicle_assignments
const firstAssignment = solicitud.vehicle_assignments?.[0];
const conductorEmail = firstAssignment?.conductor_id?.email;
const conductorPhone = firstAssignment?.conductor_id?.phone; // ✅ Solo en conductor_id.phone
const conductorName = firstAssignment?.conductor_id?.full_name; // ✅ Siempre disponible
```

### Paso 2: Actualizar Acceso a Información del Vehículo

**Antes:**
```typescript
// ❌ No funcionará más cuando hay vehicle_assignments
const placa = solicitud.placa;
const flota = solicitud.flota;
const tipoVehiculo = solicitud.tipo_vehiculo;
const vehiculo = solicitud.vehiculo_id;
```

**Ahora:**
```typescript
// ✅ Acceder desde vehicle_assignments
const firstAssignment = solicitud.vehicle_assignments?.[0];
const placa = firstAssignment?.placa;
const flota = firstAssignment?.vehiculo_id?.flota;
const tipoVehiculo = firstAssignment?.vehiculo_id?.type;
const vehiculo = firstAssignment?.vehiculo_id;
```

### Paso 3: Actualizar Tabla de "Mis Solicitudes" y Modal de Detalle

**⚠️ IMPORTANTE:** El nombre del conductor (`full_name`) ahora está disponible y debe mostrarse en lugar del teléfono en la tabla de "Mis Solicitudes".

#### Actualizar Tabla de "Mis Solicitudes"

**Antes:**
```typescript
// ❌ Mostraba solo el teléfono del conductor en la columna
<table>
  <thead>
    <tr>
      <th>HE</th>
      <th>Fecha</th>
      <th>Origen</th>
      <th>Destino</th>
      <th>Conductor</th> {/* Mostraba solo el teléfono */}
      <th>Estado</th>
    </tr>
  </thead>
  <tbody>
    {misSolicitudes.map(solicitud => (
      <tr key={solicitud._id}>
        <td>{solicitud.he}</td>
        <td>{solicitud.fecha}</td>
        <td>{solicitud.origen}</td>
        <td>{solicitud.destino}</td>
        <td>{solicitud.conductor_phone}</td> {/* ❌ Solo teléfono */}
        <td>{solicitud.status}</td>
      </tr>
    ))}
  </tbody>
</table>
```

**Ahora:**
```typescript
// ✅ Mostrar el nombre completo del conductor en la tabla de "Mis Solicitudes"
<table>
  <thead>
    <tr>
      <th>HE</th>
      <th>Fecha</th>
      <th>Origen</th>
      <th>Destino</th>
      <th>Conductor</th> {/* Ahora muestra el nombre completo */}
      <th>Estado</th>
    </tr>
  </thead>
  <tbody>
    {misSolicitudes.map(solicitud => {
      // Obtener el primer conductor de vehicle_assignments
      const firstAssignment = solicitud.vehicle_assignments?.[0];
      const conductorName = firstAssignment?.conductor_id?.full_name || 'Sin asignar';
      
      return (
        <tr key={solicitud._id}>
          <td>{solicitud.he}</td>
          <td>{solicitud.fecha}</td>
          <td>{solicitud.origen}</td>
          <td>{solicitud.destino}</td>
          <td>{conductorName}</td> {/* ✅ Nombre completo del conductor */}
          <td>{solicitud.status}</td>
        </tr>
      );
    })}
  </tbody>
</table>
```

**Si hay múltiples conductores (múltiples vehículos):**
```typescript
// ✅ Mostrar todos los conductores separados por coma
<td>
  {solicitud.vehicle_assignments
    ?.map(assignment => assignment.conductor_id?.full_name)
    .filter(Boolean)
    .join(', ') || 'Sin asignar'}
</td>
```

#### Actualizar Modal de Detalle de Solicitud

**Antes:**
```typescript
// ❌ Modal mostraba solo email o teléfono
<Modal>
  <div>
    <h2>Detalle de Solicitud</h2>
    <p><strong>HE:</strong> {solicitud.he}</p>
    <p><strong>Fecha:</strong> {solicitud.fecha}</p>
    <p><strong>Conductor:</strong> {solicitud.conductor?.email}</p>
    <p><strong>Teléfono:</strong> {solicitud.conductor_phone}</p>
  </div>
</Modal>
```

**Ahora:**
```typescript
// ✅ Modal debe mostrar el nombre completo del conductor
<Modal>
  <div>
    <h2>Detalle de Solicitud</h2>
    <p><strong>HE:</strong> {solicitud.he}</p>
    <p><strong>Fecha:</strong> {solicitud.fecha}</p>
    <p><strong>Origen:</strong> {solicitud.origen}</p>
    <p><strong>Destino:</strong> {solicitud.destino}</p>
    
    <h3>Información del Conductor</h3>
    <p><strong>Nombre:</strong> {solicitud.vehicle_assignments?.[0]?.conductor_id?.full_name || 'Sin asignar'}</p>
    <p><strong>Email:</strong> {solicitud.vehicle_assignments?.[0]?.conductor_id?.email || 'N/A'}</p>
    <p><strong>Teléfono:</strong> {solicitud.vehicle_assignments?.[0]?.conductor_id?.phone || 'N/A'}</p>
  </div>
  
  {/* Si hay múltiples vehículos */}
  {solicitud.vehicle_assignments && solicitud.vehicle_assignments.length > 1 && (
    <div>
      <h4>Vehículos y Conductores Asignados</h4>
      <table>
        <thead>
          <tr>
            <th>Placa</th>
            <th>Conductor</th>
            <th>Pasajeros</th>
          </tr>
        </thead>
        <tbody>
          {solicitud.vehicle_assignments.map((assignment, index) => (
            <tr key={index}>
              <td>{assignment.placa}</td>
              <td>{assignment.conductor_id?.full_name || 'Sin asignar'}</td>
              <td>{assignment.assigned_passengers}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}
</Modal>
```

### Paso 4: Manejar Múltiples Vehículos

**Antes:**
```typescript
// ❌ Solo había un vehículo en el nivel superior
const vehiculo = solicitud.vehiculo_id;
const conductor = solicitud.conductor;
```

**Ahora:**
```typescript
// ✅ Iterar sobre vehicle_assignments para múltiples vehículos
solicitud.vehicle_assignments?.forEach((assignment) => {
  const vehiculo = assignment.vehiculo_id;
  const conductor = assignment.conductor_id;
  const placa = assignment.placa;
  const pasajerosAsignados = assignment.assigned_passengers;
  
  // Usar conductor.full_name
  console.log(`Conductor: ${conductor?.full_name}`);
  console.log(`Email: ${conductor?.email}`);
  console.log(`Teléfono: ${conductor?.phone}`); // ✅ Solo en conductor_id.phone
});
```

---

## Campos del Conductor

### Estructura del Objeto `conductor_id`

```typescript
interface ConductorInfo {
  _id: string;
  full_name: string;  // ✅ Nombre completo (siempre disponible)
  email: string;
  phone?: string;     // ✅ Teléfono extraído de contact.phone
}
```

### Campos Disponibles

- ✅ `conductor_id.full_name` - Nombre completo del conductor
- ✅ `conductor_id.email` - Email del conductor
- ✅ `conductor_id.phone` - Teléfono del conductor (único lugar donde aparece)

**Nota:** El teléfono del conductor solo está disponible en `conductor_id.phone`. Se eliminó el campo duplicado `conductor_phone`.

---

## Ejemplo Completo de Uso

```typescript
interface Solicitud {
  _id: string;
  he: string;
  fecha: string;
  origen: string;
  destino: string;
  cliente: {
    _id: string;
    name: string;
    email: string;
  };
  vehicle_assignments: Array<{
    vehiculo_id: {
      _id: string;
      placa: string;
      type: string;
      flota: string;
      seats: number;
    };
    placa: string;
    seats: number;
    assigned_passengers: number;
    conductor_id: {
      _id: string;
      full_name: string;  // ✅ Nombre completo del conductor
      email: string;
      phone?: string;     // ✅ Teléfono del conductor (único lugar donde aparece)
    };
    contract_id?: string;
    contract_charge_mode: string;
    contract_charge_amount: number;
    accounting: {
      pagos: any[];
    };
  }>;
  status: "pending" | "accepted" | "rejected";
  service_status: "not-started" | "started" | "finished";
}

// Función helper para obtener información del primer vehículo
function getFirstVehicleInfo(solicitud: Solicitud) {
  const assignment = solicitud.vehicle_assignments?.[0];
  if (!assignment) return null;
  
  return {
    placa: assignment.placa,
    tipo: assignment.vehiculo_id.type,
    flota: assignment.vehiculo_id.flota,
    conductor: {
      id: assignment.conductor_id._id,
      nombre: assignment.conductor_id.full_name,  // ✅ Usar full_name
      email: assignment.conductor_id.email,
      telefono: assignment.conductor_id.phone  // ✅ Solo en conductor_id.phone
    },
    pasajerosAsignados: assignment.assigned_passengers
  };
}

// Función helper para obtener todos los conductores
function getAllConductors(solicitud: Solicitud) {
  return solicitud.vehicle_assignments?.map(assignment => ({
    id: assignment.conductor_id._id,
    nombre: assignment.conductor_id.full_name,  // ✅ Usar full_name
    email: assignment.conductor_id.email,
    telefono: assignment.conductor_id.phone,  // ✅ Solo en conductor_id.phone
    vehiculo: assignment.vehiculo_id.placa
  })) || [];
}

// Función helper para obtener nombre del conductor (para tabla)
function getConductorName(solicitud: Solicitud): string {
  return solicitud.vehicle_assignments?.[0]?.conductor_id?.full_name || 'Sin asignar';
}
```

---

## Checklist de Migración

- [ ] Actualizar acceso a `conductor` → usar `vehicle_assignments[].conductor_id`
- [ ] Actualizar acceso a `conductor_phone` → usar `vehicle_assignments[].conductor_id.phone` (se eliminó `conductor_phone`)
- [ ] Actualizar acceso a `placa` → usar `vehicle_assignments[].placa`
- [ ] Actualizar acceso a `flota` → usar `vehicle_assignments[].vehiculo_id.flota`
- [ ] Actualizar acceso a `vehiculo_id` → usar `vehicle_assignments[].vehiculo_id`
- [ ] Actualizar acceso a `tipo_vehiculo` → usar `vehicle_assignments[].vehiculo_id.type`
- [ ] Usar `conductor_id.full_name` en lugar de `conductor.full_name` (ahora siempre disponible)
- [ ] **Actualizar tabla de "Mis Solicitudes": reemplazar teléfono por nombre del conductor (`full_name`)**
- [ ] **Actualizar modal de detalle de solicitud: mostrar nombre completo del conductor (`full_name`)**
- [ ] Manejar múltiples vehículos iterando sobre `vehicle_assignments`
- [ ] Actualizar componentes que muestran información del conductor para usar `full_name`
- [ ] Actualizar componentes que muestran información del vehículo para usar `vehicle_assignments`
- [ ] Probar con solicitudes que tienen múltiples vehículos asignados
- [ ] Verificar que no haya referencias a campos eliminados del nivel superior

---

## Preguntas Frecuentes

### ¿Qué pasa con las solicitudes antiguas que no tienen `vehicle_assignments`?

El backend automáticamente crea `vehicle_assignments` desde los campos individuales si no existen, por lo que siempre habrá `vehicle_assignments` disponibles.

### ¿Por qué se eliminaron los campos del nivel superior?

Para evitar duplicación de datos y overfetching. Cuando hay múltiples vehículos, solo tiene sentido tener la información dentro de `vehicle_assignments`.

### ¿Cómo obtengo el primer vehículo/conductor?

```typescript
const firstAssignment = solicitud.vehicle_assignments?.[0];
const conductor = firstAssignment?.conductor_id;
const vehiculo = firstAssignment?.vehiculo_id;
```

### ¿Dónde está el teléfono del conductor?

El teléfono del conductor ahora solo está disponible en `conductor_id.phone` dentro de cada `vehicle_assignments`. Se eliminó el campo duplicado `conductor_phone` para evitar redundancia.

```typescript
const conductorPhone = solicitud.vehicle_assignments?.[0]?.conductor_id?.phone;
```

### ¿Cómo muestro el nombre del conductor en la tabla?

```typescript
const conductorName = solicitud.vehicle_assignments?.[0]?.conductor_id?.full_name || 'Sin asignar';
```

---

## Soporte

Si tienes preguntas o encuentras problemas con estos cambios, contacta al equipo de backend.

---

**Última actualización:** Enero 2026
