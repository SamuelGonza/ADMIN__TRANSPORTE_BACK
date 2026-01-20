# 📋 Cambios en el Endpoint `POST /api/v1/solicitudes/find-vehicles`

## 📌 Resumen de Cambios

Se han realizado mejoras importantes en el endpoint de búsqueda de vehículos disponibles para garantizar que:

1. ✅ **Se incluyan todos los tipos de vehículos** (propios, afiliados y externos)
2. ✅ **Se valide correctamente la disponibilidad** de vehículos y conductores
3. ✅ **No se sugieran vehículos/conductores ya ocupados** en el mismo rango de fechas y horas
4. ✅ **Se optimice la distribución** para usar el menor número de vehículos posible
5. ✅ **Se filtren conductores ocupados** de la lista de `possible_drivers`

---

## 🔧 Problemas Corregidos

### Antes:
- ❌ Solo mostraba vehículos propios (no incluía afiliados ni externos)
- ❌ No validaba la disponibilidad de conductores
- ❌ Validación de solapamiento incompleta
- ❌ Podía sugerir vehículos/conductores ya ocupados en solicitudes anteriores
- ❌ Sugería múltiples vehículos innecesarios (ej: 3 vehículos cuando 1 era suficiente)
- ❌ Mostraba conductores ocupados en `possible_drivers`

### Ahora:
- ✅ Incluye vehículos propios, afiliados y externos
- ✅ Valida disponibilidad de vehículos Y conductores
- ✅ Validación completa de solapamiento de horarios
- ✅ No sugiere vehículos/conductores ocupados
- ✅ Optimiza para usar el menor número de vehículos necesario
- ✅ Filtra automáticamente conductores ocupados de `possible_drivers`

---

## 📡 Endpoint

```
POST /api/v1/solicitudes/find-vehicles
```

### Request Body

```json
{
  "requested_passengers": 50,
  "fecha": "2026-01-20T00:00:00.000Z",
  "hora_inicio": "14:00",
  "vehicle_type": "bus" // Opcional
}
```

#### Parámetros:

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `requested_passengers` | `number` | ✅ Sí | Cantidad de pasajeros solicitados |
| `fecha` | `string` (ISO 8601) | ✅ Sí | Fecha del servicio |
| `hora_inicio` | `string` (HH:MM) | ✅ Sí | Hora de inicio del servicio |
| `vehicle_type` | `string` | ❌ No | Tipo de vehículo: `bus`, `buseta`, `buseton`, `camioneta`, `campero`, `micro`, `van` |

---

## 📤 Response Structure

### Respuesta Exitosa (200 OK)

```json
{
  "message": "Vehículos encontrados correctamente",
  "data": {
    "requested_passengers": 50,
    "total_available_seats": 135,
    "total_vehicles_needed": 1,
    "remaining_passengers": 0,
    "can_fulfill": true,
    "distribution": [
      {
        "vehiculo": {
          "_id": "6940534d8751a39a09284bd8",
          "placa": "DEF456",
          "n_numero_interno": "AF-010",
          "seats": 80,
          "type": "camioneta",
          "flota": "afiliado"
        },
        "seats": 80,
        "assigned_passengers": 50,
        "is_available": true,
        "is_in_service": false
      }
    ],
    "available_vehicles": [
      {
        "vehiculo": {
          "_id": "6940534d8751a39a09284bd7",
          "placa": "XYZ789",
          "n_numero_interno": "TL-002",
          "seats": 40,
          "type": "bus",
          "flota": "propio"
        },
        "seats": 40,
        "is_available": true,
        "is_in_service": false,
        "conflicting_service": null,
        "flota_priority": 3,
        "driver": {
          "_id": "6940534c8751a39a09284bd1",
          "full_name": "Roberto Castro Conductor",
          "phone": "3224445556",
          "is_busy": false
        },
        "possible_drivers": [
          {
            "_id": "6940534c8751a39a09284bd0",
            "full_name": "María García Conductor",
            "phone": "3211112223"
          }
        ],
        "assigned_passengers": 0
      }
    ],
    "in_service_vehicles": [
      {
        "vehiculo": {
          "_id": "6940534d8751a39a09284bd8",
          "placa": "DEF456",
          "n_numero_interno": "AF-010",
          "seats": 80,
          "type": "camioneta",
          "flota": "afiliado"
        },
        "seats": 80,
        "is_available": false,
        "is_in_service": true,
        "conflicting_service": {
          "hora_inicio": "12:25",
          "hora_final": "23:59",
          "fecha": "2026-01-20T05:00:00.000Z"
        },
        "message": "Este vehículo está en servicio el 20/01/2026 de 12:25 a 23:59. Puedes seleccionarlo para una fecha u hora posterior.",
        "driver": {
          "_id": "6940534c8751a39a09284bd0",
          "full_name": "Andrés López Conductor",
          "phone": "3211112223",
          "is_busy": true
        },
        "possible_drivers": []
      }
    ]
  }
}
```

---

## 🔍 Validaciones Implementadas

### 1. **Inclusión de Vehículos**

El sistema ahora incluye vehículos según estos criterios:

- **Propios**: `owner_id.company_id` coincide con la compañía del usuario
- **Afiliados**: El conductor principal o alguno de los conductores alternativos pertenece a la compañía
- **Externos**: El conductor principal pertenece a la compañía

### 2. **Validación de Disponibilidad de Vehículos**

Un vehículo se considera **NO disponible** si:

- Tiene una solicitud activa (`status: "pending"` o `"accepted"`) en la misma fecha
- El servicio conflictivo tiene solapamiento de horarios con la nueva solicitud
- El solapamiento se detecta si:
  - La hora de inicio nueva está dentro del rango del servicio existente
  - La hora de inicio existente está dentro del rango nuevo (estimado)
  - Hay cualquier solapamiento entre los rangos

**Nota importante**: Si una solicitud no tiene `hora_final` (servicio no finalizado), se considera que el vehículo está ocupado desde la `hora_inicio` hasta el final del día (23:59).

### 3. **Validación de Disponibilidad de Conductores**

Un conductor se considera **ocupado** si:

- Está asignado a una solicitud activa en la misma fecha
- El servicio tiene solapamiento de horarios con la nueva solicitud
- El conductor puede estar asignado como:
  - Conductor principal (`conductor`)
  - Conductor en `vehicle_assignments` (multi-vehículo)

**Cambio importante**: Los conductores ocupados **NO aparecen** en `possible_drivers`. Solo se muestran conductores disponibles.

### 4. **Optimización de Distribución**

La distribución ahora optimiza para usar el menor número de vehículos:

1. **Primero**: Busca si hay un solo vehículo que pueda cubrir todos los pasajeros
2. **Si no**: Usa un algoritmo voraz que prioriza vehículos más grandes para minimizar la cantidad necesaria

**Ejemplo**:
- Antes: 70 pasajeros → sugería 3 vehículos (80 + 50 + 40 asientos)
- Ahora: 70 pasajeros → sugiere 1 vehículo (80 asientos con 70 pasajeros asignados)

### 5. **Priorización**

Los vehículos se ordenan por:

1. **Disponibilidad** (disponibles primero)
2. **Tipo de flota** (propio > afiliado > externo)
3. **Capacidad** (mayor capacidad primero)

---

## 📊 Estructura Detallada de la Respuesta

### `data` Object

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `requested_passengers` | `number` | Cantidad de pasajeros solicitados |
| `total_available_seats` | `number` | Total de asientos disponibles en vehículos libres |
| `total_vehicles_needed` | `number` | Cantidad de vehículos necesarios según la distribución sugerida |
| `remaining_passengers` | `number` | Pasajeros que no se pueden cubrir (0 si `can_fulfill` es true) |
| `can_fulfill` | `boolean` | `true` si hay suficientes vehículos disponibles para cubrir todos los pasajeros |
| `distribution` | `array` | Distribución optimizada de pasajeros por vehículo |
| `available_vehicles` | `array` | Lista completa de vehículos disponibles |
| `in_service_vehicles` | `array` | Lista de vehículos ocupados (con información del conflicto) |

### `distribution[]` Array

Cada elemento contiene:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `vehiculo` | `object` | Información del vehículo |
| `seats` | `number` | Capacidad total de asientos |
| `assigned_passengers` | `number` | Pasajeros asignados a este vehículo en la distribución |
| `is_available` | `boolean` | Siempre `true` en distribución |
| `is_in_service` | `boolean` | Siempre `false` en distribución |

### `available_vehicles[]` Array

Cada elemento contiene:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `vehiculo` | `object` | Información del vehículo |
| `seats` | `number` | Capacidad total de asientos |
| `is_available` | `boolean` | `true` si está disponible |
| `is_in_service` | `boolean` | `false` si está disponible |
| `conflicting_service` | `object \| null` | Información del servicio conflictivo (si existe) |
| `flota_priority` | `number` | Prioridad: 3=propio, 2=afiliado, 1=externo |
| `driver` | `object \| null` | Conductor principal del vehículo |
| `possible_drivers` | `array` | ⚠️ **CAMBIADO**: Solo incluye conductores disponibles (ocupados filtrados) |
| `assigned_passengers` | `number` | Siempre `0` (no asignados aún) |

### `in_service_vehicles[]` Array

Cada elemento contiene:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `vehiculo` | `object` | Información del vehículo |
| `seats` | `number` | Capacidad total de asientos |
| `is_available` | `boolean` | Siempre `false` |
| `is_in_service` | `boolean` | Siempre `true` |
| `conflicting_service` | `object` | Información del servicio que causa el conflicto |
| `message` | `string` | Mensaje descriptivo del conflicto |
| `driver` | `object \| null` | Conductor principal (con `is_busy: true` si está ocupado) |
| `possible_drivers` | `array` | ⚠️ **CAMBIADO**: Array vacío (conductores ocupados filtrados) |

### `driver` Object

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `_id` | `string` | ID único del conductor |
| `full_name` | `string` | Nombre completo |
| `phone` | `string` | Teléfono de contacto |
| `is_busy` | `boolean` | ⚠️ **NUEVO**: Indica si el conductor está ocupado (solo en `in_service_vehicles`) |

### `conflicting_service` Object

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `hora_inicio` | `string` | Hora de inicio del servicio conflictivo |
| `hora_final` | `string` | Hora final del servicio conflictivo (o "23:59" si no ha finalizado) |
| `fecha` | `string` | Fecha del servicio conflictivo (ISO 8601) |

---

## 💡 Ejemplos de Uso

### Ejemplo 1: Solicitud con vehículo único suficiente

**Request:**
```json
{
  "requested_passengers": 70,
  "fecha": "2026-01-20T00:00:00.000Z",
  "hora_inicio": "14:00"
}
```

**Response:**
```json
{
  "message": "Vehículos encontrados correctamente",
  "data": {
    "requested_passengers": 70,
    "total_available_seats": 135,
    "total_vehicles_needed": 1,
    "remaining_passengers": 0,
    "can_fulfill": true,
    "distribution": [
      {
        "vehiculo": { "placa": "DEF456", "seats": 80, "flota": "afiliado" },
        "assigned_passengers": 70
      }
    ],
    "available_vehicles": [...],
    "in_service_vehicles": []
  }
}
```

**Nota**: Solo sugiere 1 vehículo porque puede cubrir todos los pasajeros.

### Ejemplo 2: Solicitud con vehículos ocupados

**Request:**
```json
{
  "requested_passengers": 50,
  "fecha": "2026-01-20T00:00:00.000Z",
  "hora_inicio": "13:00"
}
```

**Response:**
```json
{
  "message": "Vehículos encontrados correctamente",
  "data": {
    "requested_passengers": 50,
    "total_available_seats": 55,
    "total_vehicles_needed": 1,
    "remaining_passengers": 0,
    "can_fulfill": true,
    "distribution": [
      {
        "vehiculo": { "placa": "XYZ789", "seats": 50 },
        "assigned_passengers": 50
      }
    ],
    "available_vehicles": [...],
    "in_service_vehicles": [
      {
        "vehiculo": { "placa": "DEF456", "seats": 80 },
        "is_available": false,
        "is_in_service": true,
        "conflicting_service": {
          "hora_inicio": "12:25",
          "hora_final": "23:59",
          "fecha": "2026-01-20T05:00:00.000Z"
        },
        "message": "Este vehículo está en servicio el 20/01/2026 de 12:25 a 23:59. Puedes seleccionarlo para una fecha u hora posterior.",
        "driver": {
          "_id": "6940534c8751a39a09284bd0",
          "full_name": "Andrés López Conductor",
          "phone": "3211112223",
          "is_busy": true
        },
        "possible_drivers": []
      }
    ]
  }
}
```

### Ejemplo 3: Conductor ocupado filtrado de possible_drivers

**Escenario**: 
- Vehículo ABC123 tiene 2 conductores alternativos: Andrés López y María García
- Andrés López está ocupado en otra solicitud el mismo día/hora
- María García está disponible

**Response (fragmento):**
```json
{
  "available_vehicles": [
    {
      "vehiculo": { "placa": "ABC123", "seats": 15 },
      "driver": {
        "_id": "6940534c8751a39a09284bd0",
        "full_name": "Andrés López Conductor",
        "phone": "3211112223",
        "is_busy": false
      },
      "possible_drivers": [
        {
          "_id": "6940534c8751a39a09284bd1",
          "full_name": "María García Conductor",
          "phone": "3224445556"
        }
      ]
    }
  ]
}
```

**Nota**: Andrés López NO aparece en `possible_drivers` porque está ocupado. Solo aparece María García que está disponible.

---

## ⚠️ Consideraciones Importantes

### 1. **Campo `possible_drivers` Filtrado**

⚠️ **CAMBIO IMPORTANTE**: El campo `possible_drivers` ahora **solo incluye conductores disponibles**. Los conductores ocupados en el mismo rango de fechas/horas son automáticamente filtrados.

**Antes**: Mostraba todos los conductores alternativos, incluso si estaban ocupados.
**Ahora**: Solo muestra conductores que están disponibles.

### 2. **Cálculo de Hora Final para Servicios No Finalizados**

Si una solicitud está aceptada o iniciada pero **no tiene `hora_final`** (servicio no finalizado), se considera que el vehículo/conductor está ocupado desde la `hora_inicio` hasta el **final del día (23:59)**.

Esto es conservador y evita asignar vehículos/conductores que ya están en uso.

### 3. **Optimización de Distribución**

La distribución ahora optimiza para usar el menor número de vehículos:

- Si hay un vehículo que puede cubrir todos los pasajeros, solo sugiere ese vehículo
- Si necesita múltiples vehículos, prioriza los más grandes para minimizar la cantidad

### 4. **Mensajes de Conflicto**

Los mensajes en `in_service_vehicles[].message` pueden indicar:
- **Conflicto de vehículo**: El vehículo está en servicio
- **Conflicto de conductor**: El conductor está ocupado (puede seleccionar otro conductor)

### 5. **Vehículos Externos**

Los vehículos externos ahora se incluyen si su conductor pertenece a la compañía. Estos tienen `flota_priority: 1` (menor prioridad).

---

## 🔄 Cambios desde la Versión Anterior

### Campos Modificados:
- ✅ `possible_drivers` - Ahora solo incluye conductores disponibles (ocupados filtrados)
- ✅ `driver.is_busy` - Indica si el conductor está ocupado (solo en `in_service_vehicles`)

### Comportamiento Mejorado:
- ✅ Incluye vehículos afiliados y externos (antes solo propios)
- ✅ Validación completa de solapamiento de horarios
- ✅ Validación de disponibilidad de conductores
- ✅ Filtrado automático de conductores ocupados
- ✅ Optimización de distribución (menor número de vehículos)
- ✅ Mejor detección de conflictos (considera servicios no finalizados hasta 23:59)

---

## 📝 Notas para el Frontend

1. **Usar `distribution` para mostrar la sugerencia inicial** de asignación de vehículos
2. **Mostrar `in_service_vehicles` con el mensaje** para informar al usuario por qué ciertos vehículos no están disponibles
3. **Verificar `can_fulfill`** para saber si se pueden cubrir todos los pasajeros
4. **Mostrar `remaining_passengers`** si `can_fulfill` es `false`
5. **Considerar `flota_priority`** si necesitas ordenar vehículos manualmente
6. **El campo `is_busy` en `driver`** puede usarse para mostrar un indicador visual de que el conductor está ocupado
7. **⚠️ IMPORTANTE**: `possible_drivers` ahora solo contiene conductores disponibles. No necesitas filtrar manualmente.

---

## 🐛 Manejo de Errores

### Error 400 - Bad Request
```json
{
  "ok": false,
  "message": "requested_passengers, fecha y hora_inicio son requeridos"
}
```

### Error 401 - Unauthorized
```json
{
  "ok": false,
  "message": "No se pudo identificar la compañía del usuario"
}
```

### Error 404 - Not Found
```json
{
  "ok": false,
  "message": "No hay vehículos disponibles"
}
```

### Error 500 - Internal Server Error
```json
{
  "ok": false,
  "message": "Error al buscar vehículos disponibles"
}
```

---

## 📞 Soporte

Si tienes dudas sobre la implementación o encuentras algún problema, contacta al equipo de backend.

---

**Última actualización**: Enero 2026
