# 📋 Cambios en la Generación de Prefacturas Múltiples

## 🎯 Resumen del Cambio

**Fecha:** Enero 2025  
**Nuevo Endpoint:** `POST /api/v1/solicitudes/generate-prefactura-multiple`

Ahora es posible **seleccionar múltiples solicitudes del mismo cliente** y generar **una sola prefactura compartida** para todas ellas. Todas las solicitudes compartirán el mismo número de prefactura.

---

## 🆕 Nuevo Endpoint

### Endpoint para Prefactura Múltiple

**URL:** `POST /api/v1/solicitudes/generate-prefactura-multiple`

**Autenticación:** Requiere rol `contabilidad`

**Request Body:**
```json
{
  "solicitud_ids": ["64f8a1b2c3d4e5f6g7h8i9j0", "64f8a1b2c3d4e5f6g7h8i9j1", "64f8a1b2c3d4e5f6g7h8i9j2"]
}
```

**Parámetros:**
- `solicitud_ids` (array de strings, requerido): Array con los IDs de las solicitudes a incluir en la prefactura. Mínimo 1 solicitud.

---

## 📝 Formato del Número de Prefactura Múltiple

El número se genera automáticamente con el siguiente formato:

### Para múltiples solicitudes:
```
PREF_MULTI_{HE_PRIMERA}-{HE_ULTIMA}_{NOMBRE_CLIENTE}
```

### Para una sola solicitud:
Si solo se envía una solicitud, se usa el formato estándar:
```
PREF_{HE}_{NOMBRE_CLIENTE}
```

### Componentes:

1. **`PREF_MULTI_`** - Prefijo para prefacturas múltiples
2. **`{HE_PRIMERA}-{HE_ULTIMA}`** - Rango de consecutivos (HE) ordenados alfabéticamente
   - Ejemplo: Si las solicitudes son `NAT-3`, `NAT-5`, `NAT-7` → `NAT-3-NAT-7`
3. **`{NOMBRE_CLIENTE}`** - Nombre del cliente limpiado y normalizado:
   - Convertido a mayúsculas
   - Espacios reemplazados por guiones bajos (`_`)
   - Caracteres especiales eliminados
   - Múltiples guiones bajos consolidados en uno solo

### Ejemplos:

| Solicitudes HE | Cliente | Número de Prefactura Generado |
|----------------|---------|-------------------------------|
| `NAT-3`, `NAT-5`, `NAT-7` | Corporación XYZ | `PREF_MULTI_NAT-3-NAT-7_CORPORACION_XYZ` |
| `TRAVEL-10`, `TRAVEL-15` | Empresa ABC S.A.S. | `PREF_MULTI_TRAVEL-10-TRAVEL-15_EMPRESA_ABC_SAS` |
| `NAT-100` (solo una) | Transportes del Valle Ltda. | `PREF_NAT-100_TRANSPORTES_DEL_VALLE_LTDA` |

---

## ✅ Validaciones que Realiza el Backend

Antes de generar la prefactura múltiple, el backend valida:

1. ✅ Se proporcionó al menos una solicitud
2. ✅ Todas las solicitudes existen
3. ✅ **Todas las solicitudes pertenecen al mismo cliente**
4. ✅ Ninguna solicitud tiene prefactura ya generada
5. ✅ Todas las solicitudes tienen valores de venta definidos (`valor_a_facturar`)
6. ✅ Todas las solicitudes tienen valores de costos definidos (`valor_cancelado`)
7. ✅ Todos los vehículos de todas las solicitudes tienen operacional subido
8. ✅ Todas las solicitudes tienen consecutivo (HE)

---

## 📤 Respuesta de la API

### Respuesta Exitosa (200)

```json
{
  "message": "Prefactura generada exitosamente para 3 solicitud(es)",
  "data": {
    "message": "Prefactura generada exitosamente para 3 solicitud(es)",
    "prefactura_numero": "PREF_MULTI_NAT-3-NAT-7_CORPORACION_XYZ",
    "solicitudes": [
      {
        "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
        "he": "NAT-3",
        "prefactura": {
          "numero": "PREF_MULTI_NAT-3-NAT-7_CORPORACION_XYZ",
          "fecha": "2025-01-15T10:30:00.000Z",
          "aprobada": false,
          "estado": "pendiente",
          "enviada_al_cliente": false,
          "historial_envios": []
        },
        "accounting_status": "prefactura_pendiente",
        "generated_prefactura_by": "64f8a1b2c3d4e5f6g7h8i9j1",
        "generated_prefactura_at": "2025-01-15T10:30:00.000Z",
        // ... resto de campos de la solicitud
      },
      {
        "_id": "64f8a1b2c3d4e5f6g7h8i9j1",
        "he": "NAT-5",
        "prefactura": {
          "numero": "PREF_MULTI_NAT-3-NAT-7_CORPORACION_XYZ",
          // ... misma prefactura para todas
        },
        // ... resto de campos
      },
      {
        "_id": "64f8a1b2c3d4e5f6g7h8i9j2",
        "he": "NAT-7",
        "prefactura": {
          "numero": "PREF_MULTI_NAT-3-NAT-7_CORPORACION_XYZ",
          // ... misma prefactura para todas
        },
        // ... resto de campos
      }
    ]
  }
}
```

### Errores Posibles

#### 400 - Array vacío o inválido
```json
{
  "ok": false,
  "message": "Debe proporcionar un array de IDs de solicitudes"
}
```

#### 400 - Solicitudes de diferentes clientes
```json
{
  "ok": false,
  "message": "Todas las solicitudes deben pertenecer al mismo cliente"
}
```

#### 400 - Ya existe prefactura en alguna solicitud
```json
{
  "ok": false,
  "message": "Las siguientes solicitudes ya tienen prefactura generada: NAT-3, NAT-5"
}
```

#### 400 - Validaciones múltiples
```json
{
  "ok": false,
  "message": "La solicitud NAT-3 no tiene valores de venta definidos; Faltan operacionales en la solicitud NAT-5 para los vehículos: ABC123, XYZ789"
}
```

#### 404 - Solicitudes no encontradas
```json
{
  "ok": false,
  "message": "Las siguientes solicitudes no fueron encontradas: 64f8a1b2c3d4e5f6g7h8i9j0, 64f8a1b2c3d4e5f6g7h8i9j1"
}
```

#### 500 - Error interno
```json
{
  "ok": false,
  "message": "Error al generar prefactura múltiple"
}
```

---

## 💻 Ejemplo de Implementación Frontend

### TypeScript/JavaScript

```typescript
/**
 * Generar prefactura para múltiples solicitudes del mismo cliente
 * @param solicitudIds Array de IDs de solicitudes a incluir
 */
async function generarPrefacturaMultiple(solicitudIds: string[]) {
  try {
    // Validar que se proporcionen solicitudes
    if (!solicitudIds || solicitudIds.length === 0) {
      throw new Error('Debe seleccionar al menos una solicitud');
    }

    const response = await fetch(
      `/api/v1/solicitudes/generate-prefactura-multiple`,
      {
        method: 'POST',
        credentials: 'include', // Importante para cookies
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          solicitud_ids: solicitudIds
        })
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message);
    }

    const data = await response.json();
    console.log('Prefactura generada:', data.data.prefactura_numero);
    console.log('Solicitudes actualizadas:', data.data.solicitudes.length);
    
    return data;
  } catch (error) {
    console.error('Error al generar prefactura múltiple:', error);
    throw error;
  }
}
```

### Ejemplo con React

```tsx
import { useState } from 'react';

interface Solicitud {
  _id: string;
  he: string;
  cliente: {
    _id: string;
    name: string;
  };
  prefactura?: {
    numero?: string;
  };
}

function PrefacturaMultipleForm() {
  const [solicitudesSeleccionadas, setSolicitudesSeleccionadas] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [prefacturaNumero, setPrefacturaNumero] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Lista de solicitudes disponibles (ejemplo)
  const solicitudes: Solicitud[] = [
    // ... tus solicitudes
  ];

  // Filtrar solo solicitudes del mismo cliente y sin prefactura
  const solicitudesDisponibles = solicitudes.filter(s => 
    !s.prefactura?.numero && 
    s.cliente._id === solicitudes[0]?.cliente._id
  );

  const handleSeleccionarSolicitud = (solicitudId: string) => {
    setSolicitudesSeleccionadas(prev => {
      if (prev.includes(solicitudId)) {
        return prev.filter(id => id !== solicitudId);
      }
      return [...prev, solicitudId];
    });
  };

  const handleGenerarPrefactura = async () => {
    if (solicitudesSeleccionadas.length === 0) {
      setError('Debe seleccionar al menos una solicitud');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/solicitudes/generate-prefactura-multiple`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            solicitud_ids: solicitudesSeleccionadas
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message);
      }

      const data = await response.json();
      setPrefacturaNumero(data.data.prefactura_numero);
      
      // Mostrar mensaje de éxito
      alert(`Prefactura ${data.data.prefactura_numero} generada exitosamente para ${data.data.solicitudes.length} solicitud(es)`);
      
      // Limpiar selección
      setSolicitudesSeleccionadas([]);
      
      // Recargar datos si es necesario
      // window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al generar prefactura');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Generar Prefactura Múltiple</h2>
      
      {/* Lista de solicitudes disponibles */}
      <div>
        <h3>Seleccione las solicitudes:</h3>
        {solicitudesDisponibles.map(solicitud => (
          <label key={solicitud._id} style={{ display: 'block', marginBottom: '8px' }}>
            <input
              type="checkbox"
              checked={solicitudesSeleccionadas.includes(solicitud._id)}
              onChange={() => handleSeleccionarSolicitud(solicitud._id)}
            />
            {solicitud.he} - {solicitud.cliente.name}
          </label>
        ))}
      </div>

      {/* Botón de generar */}
      <button 
        onClick={handleGenerarPrefactura} 
        disabled={loading || solicitudesSeleccionadas.length === 0}
        style={{ marginTop: '16px' }}
      >
        {loading ? 'Generando...' : `Generar Prefactura (${solicitudesSeleccionadas.length} seleccionadas)`}
      </button>

      {/* Mostrar error */}
      {error && (
        <div style={{ color: 'red', marginTop: '16px' }}>
          Error: {error}
        </div>
      )}

      {/* Mostrar prefactura generada */}
      {prefacturaNumero && (
        <div style={{ color: 'green', marginTop: '16px' }}>
          Prefactura generada: <strong>{prefacturaNumero}</strong>
        </div>
      )}
    </div>
  );
}

export default PrefacturaMultipleForm;
```

---

## 🔄 Comparación con Prefactura Individual

### Prefactura Individual
- **Endpoint:** `POST /api/v1/solicitudes/{id}/generate-prefactura`
- **Body:** Vacío o `{}`
- **Formato:** `PREF_{HE}_{NOMBRE_CLIENTE}`
- **Uso:** Una solicitud a la vez

### Prefactura Múltiple (Nuevo)
- **Endpoint:** `POST /api/v1/solicitudes/generate-prefactura-multiple`
- **Body:** `{ "solicitud_ids": ["id1", "id2", ...] }`
- **Formato:** `PREF_MULTI_{HE_PRIMERA}-{HE_ULTIMA}_{NOMBRE_CLIENTE}`
- **Uso:** Múltiples solicitudes del mismo cliente

**Nota:** Si solo se envía una solicitud en `solicitud_ids`, el sistema automáticamente usa el formato individual (`PREF_{HE}_{NOMBRE_CLIENTE}`).

---

## 📋 Checklist de Implementación Frontend

- [ ] Crear componente/interfaz para seleccionar múltiples solicitudes
- [ ] Validar que todas las solicitudes seleccionadas pertenezcan al mismo cliente (opcional, el backend también lo valida)
- [ ] Filtrar solicitudes que ya tienen prefactura generada
- [ ] Implementar función para llamar al endpoint `generate-prefactura-multiple`
- [ ] Manejar errores específicos (diferentes clientes, prefacturas existentes, etc.)
- [ ] Mostrar el número de prefactura generado
- [ ] Actualizar la UI después de generar la prefactura
- [ ] Actualizar tipos TypeScript/interfaces si aplica
- [ ] Probar con diferentes combinaciones de solicitudes

---

## 🎨 Sugerencias de UI/UX

1. **Selector de solicitudes:**
   - Usar checkboxes o un selector múltiple
   - Agrupar por cliente para facilitar la selección
   - Mostrar información relevante (HE, fecha, cliente)

2. **Validación visual:**
   - Deshabilitar solicitudes que ya tienen prefactura
   - Mostrar advertencia si se seleccionan solicitudes de diferentes clientes
   - Indicar cuántas solicitudes están seleccionadas

3. **Feedback al usuario:**
   - Mostrar loading durante la generación
   - Mostrar mensaje de éxito con el número de prefactura
   - Mostrar errores específicos y claros

4. **Después de generar:**
   - Actualizar la lista de solicitudes
   - Mostrar el número de prefactura en cada solicitud
   - Permitir navegar a la vista de detalles de la prefactura

---

## 🔍 Casos de Uso

### Caso 1: Múltiples servicios para el mismo cliente
Un cliente tiene 3 servicios diferentes (`NAT-3`, `NAT-5`, `NAT-7`) y quiere una sola prefactura que los agrupe.

**Solución:** Seleccionar las 3 solicitudes y generar prefactura múltiple → `PREF_MULTI_NAT-3-NAT-7_CORPORACION_XYZ`

### Caso 2: Una sola solicitud
Un cliente tiene solo un servicio (`NAT-100`) y necesita prefactura.

**Solución:** Usar el endpoint múltiple con un solo ID → `PREF_NAT-100_CLIENTE` (formato individual automático)

### Caso 3: Selección incorrecta
Un usuario selecciona solicitudes de diferentes clientes por error.

**Solución:** El backend rechaza la petición con error claro: "Todas las solicitudes deben pertenecer al mismo cliente"

---

## 🆘 Soporte

Si tienes dudas o encuentras algún problema con este cambio, contacta al equipo de backend.

---

**Última actualización:** Enero 2025
