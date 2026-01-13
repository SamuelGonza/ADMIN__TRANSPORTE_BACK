# Integración de Facturación vía Webhook

Este backend expone un endpoint para que el microservicio de facturación notifique cuando se ha generado una factura exitosamente.

## Configuración

En el backend de **Administración de Transporte**, agregar la variable de entorno:

```env
WEBHOOK_SECRET=tu_secreto_super_seguro_que_coincide_con_facturacion
```

## Endpoint

**POST** `/api/v1/webhooks/billing-update`

### Headers Requeridos

| Header | Valor |
|--------|-------|
| `x-webhook-secret` | El mismo valor definido en `WEBHOOK_SECRET` |
| `Content-Type` | `application/json` |

### Payload Esperado

El microservicio de facturación debe enviar un JSON con la siguiente estructura:

```json
{
  "event": "invoice.created",
  "invoice_data": {
    "number": "FE-1025",
    "date": "2024-01-20T14:30:00Z"
  },
  "items": [
    {
      "reference_id": "65a1b2c3d4e5f6...", // ID de la Solicitud (MongoDB)
      "amount": 500000
    },
    {
      "reference_id": "65a1b2c3d4e5f7...",
      "amount": 120000
    }
  ]
}
```

## Comportamiento

1.  El backend valida el `x-webhook-secret`.
2.  Itera sobre los `items`.
3.  Busca cada solicitud por `reference_id`.
4.  Actualiza:
    *   `accounting_status` -> `"facturado"`
    *   `n_factura` -> `invoice_data.number`
    *   `fecha_factura` -> `invoice_data.date`

## Respuesta

- **200 OK**: Webhook procesado.
  ```json
  {
      "ok": true,
      "message": "Webhook procesado",
      "processed_count": 2,
      "updated_ids": ["65a1b2c...", "65a1b2d..."]
  }
  ```
- **403 Forbidden**: Secret inválido.
- **400 Bad Request**: Payload mal formado.
