# Cambios Recientes en Backend para Frontend

## 1. Solicitudes: Nuevo campo `fecha_final`

### Descripción
Se ha agregado el campo `fecha_final` (requerido) para definir con precisión la duración del servicio.

### Cambios requeridos en Frontend
- **Crear Solicitud (Cliente)**: Agregar input de fecha final. Debe ser obligatoria y posterior o igual a la fecha de inicio.
- **Crear Solicitud (Coordinador)**: Agregar input de fecha final. Obligatoria.
- **Visualización**: Mostrar `fecha_final` en los detalles de la solicitud y calcular `total_horas` o días en base a este rango si es necesario.

## 2. Solicitudes: Nuevo campo `observaciones_cliente`

### Descripción
Un campo de texto exclusivo para que el cliente ingrese observaciones al crear la solicitud.

### Cambios requeridos en Frontend
- **Crear Solicitud (Cliente)**: Agregar un `textarea` opcional "Observaciones" en el formulario de creación.
- **Crear Solicitud (Coordinador)**: **NO** agregar este campo en el formulario de creación (los coordinadores usan `novedades`).
- **Visualización**: Mostrar este campo en modo lectura para los coordinadores, para que sepan qué pidió el cliente.

## 3. Solicitudes: Consecutivo HE Personalizado

### Descripción
El consecutivo `he` ahora se genera automáticamente con un prefijo basado en la empresa seleccionada al crear la solicitud.
Ejemplos: `NAT-1`, `TRA-50`.

### Cambios requeridos en Frontend
- **Crear Solicitud (Cliente/Coordinador)**: Asegurarse de enviar el campo `empresa` ("national", "travel", etc.) en el payload.
    - El backend usará las primeras 3 letras de este campo para el prefijo.
    - Si no se envía, usará "NAT" o "HE" por defecto.
- **Visualización**: El campo `he` ahora contendrá letras (ej. "NAT-105"), ajustar si hay validaciones numéricas estrictas en la UI.


## 4. Solicitudes Gratuitas ($0)

### Descripción
El sistema ahora permite procesar solicitudes con valor de venta ($0).

### Cambios requeridos en Frontend
- **Validaciones**: Permitir ingresar $0 en los campos de "Valor a Facturar" o precios.
- **Contabilidad**: El flujo de prefactura ahora permite generar prefacturas con valor $0.

## 5. Integración Componente de Facturación

### Descripción
Para que el sistema marque automáticamente las solicitudes como "Facturadas", el componente de facturación externo debe recibir y enviar el ID de la solicitud.

### Cambios requeridos en Frontend
- Al preparar los datos para el **Componente de Facturación**, se debe incluir el `_id` de la solicitud en el campo `reference_id` de cada ítem.

#### Ejemplo de datos hacia el Componente de Facturación:
```javascript
const itemParaFacturar = {
  description: "Servicio de transporte HE-123",
  price: 500000,
  quantity: 1,
  // ... otros campos ...
  reference_id: solicitud._id // <--- CRÍTICO: Debe ser el ID de MongoDB
};
```

## Resumen de Payloads Actualizados

### POST `/api/solicitudes/client`
```json
{
  "fecha": "2024-01-20",
  "fecha_final": "2024-01-22", // NUEVO (Requerido)
  "observaciones_cliente": "Por favor conductor bilingüe", // NUEVO (Opcional)
  "empresa": "travel", // IMPORTANTE para el HE
  ...
}
```

### POST `/api/solicitudes/coordinator`
```json
{
  "fecha": "2024-01-20",
  "fecha_final": "2024-01-22", // NUEVO (Requerido)
  "empresa": "national", // IMPORTANTE para el HE
  ...
}
```
