# Campo `centro_costos` en Solicitudes

## 📋 Resumen

Se ha añadido un nuevo campo opcional `centro_costos` al modelo de solicitudes. Este campo permite establecer un centro de costos para cada solicitud, facilitando la organización y contabilidad de los servicios.

## 🔍 Detalles del Campo

### Tipo de Dato
- **Tipo**: `string`
- **Requerido**: `false` (opcional)
- **Valor por defecto**: `undefined` o `null`
- **Descripción**: Identificador o nombre del centro de costos asociado a la solicitud

### Ubicación en el Modelo

El campo `centro_costos` está ubicado en la sección de información financiera de la solicitud, después de los campos de ingresos y antes de los campos de utilidad.

```typescript
interface BitacoraSolicitud {
    // ... otros campos ...
    
    // Información financiera - Ingresos
    valor_a_facturar: number;
    n_factura: string;
    fecha_factura?: Date;
    factura_id?: ObjectId;
    preliquidaciones?: ObjectId[];
    
    // Centro de costos
    centro_costos?: string; // ⬅️ NUEVO CAMPO
    
    // Utilidad
    utilidad: number;
    porcentaje_utilidad: number;
    // ... otros campos ...
}
```

## 📡 Endpoints Afectados

### 1. Crear Solicitud (Cliente)
**Endpoint**: `POST /solicitudes/client`

**Request Body**:
```json
{
    "fecha": "2026-01-28T00:00:00.000Z",
    "hora_inicio": "08:00",
    "origen": "Bogotá",
    "destino": "Medellín",
    "n_pasajeros": 30,
    "centro_costos": "CC001" // ⬅️ Campo opcional
}
```

**Ejemplo con el campo**:
```json
{
    "fecha": "2026-01-28T00:00:00.000Z",
    "hora_inicio": "08:00",
    "origen": "Bogotá",
    "destino": "Medellín",
    "n_pasajeros": 30,
    "contacto": "Juan Pérez",
    "contacto_phone": "3001234567",
    "centro_costos": "CC001"
}
```

**Ejemplo sin el campo** (también válido):
```json
{
    "fecha": "2026-01-28T00:00:00.000Z",
    "hora_inicio": "08:00",
    "origen": "Bogotá",
    "destino": "Medellín",
    "n_pasajeros": 30
}
```

### 2. Crear Solicitud (Coordinador)
**Endpoint**: `POST /solicitudes/coordinator`

**Request Body**:
```json
{
    "bitacora_id": "65a1b2c3d4e5f6g7h8i9j0k1",
    "cliente_id": "65a1b2c3d4e5f6g7h8i9j0k2",
    "empresa": "travel",
    "fecha": "2026-01-28T00:00:00.000Z",
    "hora_inicio": "08:00",
    "origen": "Bogotá",
    "destino": "Medellín",
    "n_pasajeros": 30,
    "placa": "ABC123",
    "centro_costos": "CC001" // ⬅️ Campo opcional
}
```

### 3. Obtener Solicitud
**Endpoints**:
- `GET /solicitudes/:id`
- `GET /solicitudes/my-requests/:id` (cliente)
- `GET /solicitudes/my-services/:id` (conductor)

**Response**:
```json
{
    "message": "Solicitud obtenida exitosamente",
    "data": {
        "_id": "65a1b2c3d4e5f6g7h8i9j0k3",
        "he": "HE-001",
        "fecha": "2026-01-28T00:00:00.000Z",
        "origen": "Bogotá",
        "destino": "Medellín",
        "centro_costos": "CC001", // ⬅️ Campo presente (puede ser null o undefined)
        "valor_a_facturar": 500000,
        "utilidad": 100000,
        // ... otros campos ...
    }
}
```

### 4. Listar Solicitudes
**Endpoints**:
- `GET /solicitudes`
- `GET /solicitudes/my-requests` (cliente)
- `GET /solicitudes/my-services` (conductor)

**Response**:
```json
{
    "message": "Solicitudes obtenidas exitosamente",
    "data": {
        "solicitudes": [
            {
                "_id": "65a1b2c3d4e5f6g7h8i9j0k3",
                "he": "HE-001",
                "centro_costos": "CC001", // ⬅️ Campo presente
                // ... otros campos ...
            },
            {
                "_id": "65a1b2c3d4e5f6g7h8i9j0k4",
                "he": "HE-002",
                "centro_costos": null, // ⬅️ Puede ser null si no se estableció
                // ... otros campos ...
            }
        ],
        "pagination": { /* ... */ }
    }
}
```

## 💻 Implementación en Frontend

### TypeScript Interface

Actualizar la interfaz de solicitud en el frontend:

```typescript
interface Solicitud {
    _id: string;
    bitacora_id: string;
    he: string;
    empresa: "travel" | "national";
    fecha: Date;
    fecha_final: Date;
    hora_inicio: string;
    hora_final: string;
    total_horas: number;
    
    // Cliente y contacto
    cliente: string | Cliente;
    contacto: string;
    contacto_phone?: string;
    
    // Ruta
    origen: string;
    destino: string;
    novedades: string;
    observaciones_cliente?: string;
    
    // Información financiera - Ingresos
    valor_a_facturar: number;
    n_factura: string;
    fecha_factura?: Date;
    factura_id?: string;
    preliquidaciones?: string[];
    
    // Centro de costos ⬅️ NUEVO CAMPO
    centro_costos?: string;
    
    // Utilidad
    utilidad: number;
    porcentaje_utilidad: number;
    
    // ... otros campos ...
    
    status: "pending" | "accepted" | "rejected";
    service_status: "pendiente_de_asignacion" | "sin_asignacion" | "not-started" | "started" | "finished";
}
```

### Formulario de Creación

#### Ejemplo con React + TypeScript

```tsx
import { useState } from 'react';

interface SolicitudFormData {
    fecha: string;
    hora_inicio: string;
    origen: string;
    destino: string;
    n_pasajeros: number;
    contacto?: string;
    contacto_phone?: string;
    centro_costos?: string; // ⬅️ Nuevo campo
}

function CrearSolicitudForm() {
    const [formData, setFormData] = useState<SolicitudFormData>({
        fecha: '',
        hora_inicio: '',
        origen: '',
        destino: '',
        n_pasajeros: 0,
        centro_costos: '' // ⬅️ Inicializar vacío
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // Preparar payload (excluir campos vacíos si se desea)
        const payload: Partial<SolicitudFormData> = {
            fecha: formData.fecha,
            hora_inicio: formData.hora_inicio,
            origen: formData.origen,
            destino: formData.destino,
            n_pasajeros: formData.n_pasajeros,
        };

        // Incluir centro_costos solo si tiene valor
        if (formData.centro_costos && formData.centro_costos.trim() !== '') {
            payload.centro_costos = formData.centro_costos.trim();
        }

        // Incluir otros campos opcionales si tienen valor
        if (formData.contacto) payload.contacto = formData.contacto;
        if (formData.contacto_phone) payload.contacto_phone = formData.contacto_phone;

        try {
            const response = await fetch('/api/solicitudes/client', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (response.ok) {
                // Manejar éxito
                console.log('Solicitud creada exitosamente');
            }
        } catch (error) {
            console.error('Error al crear solicitud:', error);
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            {/* Campos requeridos */}
            <input
                type="datetime-local"
                value={formData.fecha}
                onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
                required
            />
            
            <input
                type="time"
                value={formData.hora_inicio}
                onChange={(e) => setFormData({ ...formData, hora_inicio: e.target.value })}
                required
            />
            
            <input
                type="text"
                placeholder="Origen"
                value={formData.origen}
                onChange={(e) => setFormData({ ...formData, origen: e.target.value })}
                required
            />
            
            <input
                type="text"
                placeholder="Destino"
                value={formData.destino}
                onChange={(e) => setFormData({ ...formData, destino: e.target.value })}
                required
            />
            
            <input
                type="number"
                placeholder="Número de pasajeros"
                value={formData.n_pasajeros}
                onChange={(e) => setFormData({ ...formData, n_pasajeros: parseInt(e.target.value) })}
                required
            />

            {/* Campo opcional: Centro de Costos ⬅️ NUEVO */}
            <input
                type="text"
                placeholder="Centro de Costos (opcional)"
                value={formData.centro_costos || ''}
                onChange={(e) => setFormData({ ...formData, centro_costos: e.target.value })}
            />

            {/* Otros campos opcionales */}
            <input
                type="text"
                placeholder="Contacto (opcional)"
                value={formData.contacto || ''}
                onChange={(e) => setFormData({ ...formData, contacto: e.target.value })}
            />
            
            <input
                type="tel"
                placeholder="Teléfono de contacto (opcional)"
                value={formData.contacto_phone || ''}
                onChange={(e) => setFormData({ ...formData, contacto_phone: e.target.value })}
            />

            <button type="submit">Crear Solicitud</button>
        </form>
    );
}
```

### Mostrar el Campo en Listados

```tsx
function SolicitudCard({ solicitud }: { solicitud: Solicitud }) {
    return (
        <div className="solicitud-card">
            <h3>{solicitud.he}</h3>
            <p>Origen: {solicitud.origen}</p>
            <p>Destino: {solicitud.destino}</p>
            
            {/* Mostrar centro de costos si existe ⬅️ NUEVO */}
            {solicitud.centro_costos && (
                <p className="centro-costos">
                    <strong>Centro de Costos:</strong> {solicitud.centro_costos}
                </p>
            )}
            
            <p>Valor a facturar: ${solicitud.valor_a_facturar.toLocaleString()}</p>
            {/* ... otros campos ... */}
        </div>
    );
}
```

### Actualizar Solicitud Existente

Si necesitas actualizar el campo `centro_costos` en una solicitud existente, puedes usar el endpoint de actualización correspondiente (si existe) o crear uno nuevo. Por ahora, el campo solo se puede establecer al crear la solicitud.

## ⚠️ Consideraciones Importantes

1. **Campo Opcional**: El campo `centro_costos` es completamente opcional. No es necesario incluirlo al crear una solicitud.

2. **Valores Permitidos**: El campo acepta cualquier string. No hay validación de formato específica en el backend, pero se recomienda establecer un formato consistente en el frontend (ej: "CC001", "CENTRO-001", etc.).

3. **Valores Nulos**: Si no se proporciona el campo al crear una solicitud, su valor será `undefined` o `null` en la respuesta.

4. **Compatibilidad**: Las solicitudes existentes que no tienen este campo seguirán funcionando normalmente. El campo simplemente será `undefined` o `null` para ellas.

5. **Búsqueda/Filtrado**: Actualmente no hay endpoints específicos para filtrar por `centro_costos`. Si necesitas esta funcionalidad, contacta al equipo de backend.

## 📝 Ejemplos de Uso

### Ejemplo 1: Crear solicitud con centro de costos
```javascript
const crearSolicitud = async () => {
    const response = await fetch('/api/solicitudes/client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            fecha: '2026-01-28T00:00:00.000Z',
            hora_inicio: '08:00',
            origen: 'Bogotá',
            destino: 'Medellín',
            n_pasajeros: 30,
            centro_costos: 'CC001' // ⬅️ Establecer centro de costos
        })
    });
    return response.json();
};
```

### Ejemplo 2: Crear solicitud sin centro de costos
```javascript
const crearSolicitud = async () => {
    const response = await fetch('/api/solicitudes/client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            fecha: '2026-01-28T00:00:00.000Z',
            hora_inicio: '08:00',
            origen: 'Bogotá',
            destino: 'Medellín',
            n_pasajeros: 30
            // centro_costos no incluido - es válido
        })
    });
    return response.json();
};
```

### Ejemplo 3: Manejar respuesta con centro de costos
```javascript
const obtenerSolicitud = async (id) => {
    const response = await fetch(`/api/solicitudes/${id}`);
    const data = await response.json();
    
    const solicitud = data.data;
    
    // Verificar si tiene centro de costos
    if (solicitud.centro_costos) {
        console.log(`Centro de costos: ${solicitud.centro_costos}`);
    } else {
        console.log('No tiene centro de costos asignado');
    }
    
    return solicitud;
};
```

## 🔄 Migración de Código Existente

Si tienes código existente que crea o maneja solicitudes:

1. **No es necesario cambiar nada inmediatamente**: El campo es opcional y no romperá código existente.

2. **Actualizar interfaces TypeScript**: Añade `centro_costos?: string` a tus interfaces de solicitud.

3. **Actualizar formularios**: Opcionalmente, puedes añadir un campo de entrada para `centro_costos` en tus formularios de creación.

4. **Actualizar visualizaciones**: Opcionalmente, puedes mostrar el campo `centro_costos` en las vistas de detalle y listado de solicitudes.

## 📞 Soporte

Si tienes preguntas o necesitas ayuda con la implementación de este campo, contacta al equipo de backend.

---

**Fecha de implementación**: 28 de enero de 2026  
**Versión del API**: Compatible con todas las versiones existentes
