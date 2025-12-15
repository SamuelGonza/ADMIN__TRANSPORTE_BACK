# 🚐 Asignación de Vehículo por Placa - Admin Transporte

Documentación del nuevo sistema de asignación de vehículos mediante placa.

---

## 📋 Descripción

Ahora al aceptar una solicitud, el coordinador puede ingresar **solo la placa** del vehículo y el sistema automáticamente:

1. ✅ Busca el vehículo por placa
2. ✅ Obtiene el **conductor** asignado al vehículo
3. ✅ Obtiene el **propietario** (empresa, usuario o ambos)
4. ✅ Asigna toda la información a la solicitud

---

## 🔍 Previsualizar Vehículo por Placa

### `GET /api/v1/solicitudes/vehicle/preview/:placa`

**Descripción:** Obtiene toda la información del vehículo, conductor y propietario antes de asignar. Útil para mostrar una previsualización al coordinador.

**Autenticación:** ✅ Requiere `coordinador`, `admin` o `superadmon`

**URL Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `placa` | string | Placa del vehículo (ej: ABC123) |

**Ejemplo de Petición:**
```bash
GET /api/v1/solicitudes/vehicle/preview/ABC123
```

**Respuesta Exitosa (200):**
```json
{
    "message": "Información del vehículo obtenida",
    "data": {
        "vehicle": {
            "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
            "placa": "ABC123",
            "name": "Van Sprinter 2023",
            "description": "Van Mercedes con A/C, WiFi y 15 puestos",
            "seats": 15,
            "type": "van",
            "flota": "propio",
            "picture": {
                "url": "https://res.cloudinary.com/...",
                "public_id": "...",
                "type": "image"
            }
        },
        "conductor": {
            "_id": "64f8a1b2c3d4e5f6g7h8i9j1",
            "full_name": "Andrés López Conductor",
            "document": {
                "type": "cc",
                "number": 1112223334
            },
            "phone": "3211112223",
            "email": "andres@transporte.com",
            "avatar": {
                "url": "https://res.cloudinary.com/...",
                "type": "image"
            }
        },
        "propietario": {
            "type": "Company",
            "company": {
                "_id": "64f8a1b2c3d4e5f6g7h8i9j2",
                "company_name": "TransLogística Colombia S.A.S",
                "document": {
                    "type": "nit",
                    "number": 900123456,
                    "dv": "7"
                },
                "logo": {
                    "url": "https://res.cloudinary.com/..."
                }
            },
            "user": null
        }
    }
}
```

**Tipos de Propietario:**
| Tipo | Descripción |
|------|-------------|
| `Company` | Vehículo propiedad de la empresa |
| `User` | Vehículo propiedad de un usuario (afiliado) |
| `Both` | Vehículo compartido empresa + usuario |

**Respuesta de Error (404):**
```json
{
    "ok": false,
    "message": "No se encontró vehículo con esa placa"
}
```

---

## ✅ Aceptar Solicitud (Actualizado)

### `PUT /api/v1/solicitudes/:id/accept`

**Descripción:** Acepta una solicitud pendiente asignando el vehículo mediante **placa**. El conductor se asigna automáticamente.

**Autenticación:** ✅ Requiere `coordinador`, `admin` o `superadmon`

**URL Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | ID de la solicitud |

**Body (JSON) - NUEVO:**
```json
{
    "he": "HE-2024-001",
    "empresa": "travel",
    "placa": "ABC123",
    "nombre_cuenta_cobro": "Empresas ABC Colombia",
    "valor_cancelado": 800000,
    "valor_a_facturar": 1200000,
    "utilidad": 400000,
    "porcentaje_utilidad": 33.33
}
```

> ⚠️ **Cambio importante:** Ahora se envía `placa` en lugar de `vehiculo_id` y `conductor_id`.

**Campos del Body:**
| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `he` | string | ✅ | Código HE del servicio |
| `empresa` | string | ✅ | `travel` o `national` |
| `placa` | string | ✅ | Placa del vehículo (ej: ABC123) |
| `nombre_cuenta_cobro` | string | ✅ | Nombre para la cuenta de cobro |
| `valor_cancelado` | number | ✅ | Valor a pagar |
| `valor_a_facturar` | number | ✅ | Valor a facturar |
| `utilidad` | number | ✅ | Utilidad del servicio |
| `porcentaje_utilidad` | number | ✅ | Porcentaje de utilidad |

**Respuesta Exitosa (200):**
```json
{
    "message": "Solicitud aceptada correctamente",
    "data": {
        "message": "Solicitud aceptada exitosamente",
        "solicitud": {
            "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
            "he": "HE-2024-001",
            "empresa": "travel",
            "status": "accepted",
            "service_status": "not-started",
            "placa": "ABC123",
            "tipo_vehiculo": "van",
            "flota": "propio",
            "conductor_phone": "3211112223",
            "... más campos ..."
        },
        "vehiculo": {
            "_id": "...",
            "placa": "ABC123",
            "name": "Van Sprinter 2023",
            "seats": 15,
            "type": "van",
            "flota": "propio"
        },
        "conductor": {
            "_id": "...",
            "full_name": "Andrés López Conductor",
            "phone": "3211112223",
            "email": "andres@transporte.com"
        },
        "propietario": {
            "type": "Company",
            "company": {
                "company_name": "TransLogística Colombia S.A.S"
            },
            "user": null
        }
    }
}
```

**Posibles Errores:**
| Código | Mensaje | Causa |
|--------|---------|-------|
| 400 | "Solo se pueden aceptar solicitudes pendientes" | La solicitud no está en estado pending |
| 400 | "El vehículo no tiene conductor asignado" | El vehículo no tiene driver_id |
| 404 | "Solicitud no encontrada" | ID de solicitud inválido |
| 404 | "No se encontró vehículo con esa placa" | Placa no existe |

---

## 💻 Implementación Frontend

### Flujo de Asignación de Vehículo

```typescript
// 1. Input de placa con búsqueda en tiempo real
const [placa, setPlaca] = useState('');
const [vehiclePreview, setVehiclePreview] = useState(null);
const [loading, setLoading] = useState(false);

// 2. Buscar vehículo al escribir la placa (con debounce)
const buscarVehiculo = async (placa: string) => {
    if (placa.length < 3) return;
    
    setLoading(true);
    try {
        const res = await fetch(`/api/v1/solicitudes/vehicle/preview/${placa}`, {
            credentials: 'include'
        });
        
        if (res.ok) {
            const { data } = await res.json();
            setVehiclePreview(data);
        } else {
            setVehiclePreview(null);
        }
    } catch (error) {
        console.error('Error buscando vehículo:', error);
    } finally {
        setLoading(false);
    }
};

// 3. Con debounce para no hacer muchas peticiones
useEffect(() => {
    const timer = setTimeout(() => {
        if (placa) buscarVehiculo(placa);
    }, 500);
    
    return () => clearTimeout(timer);
}, [placa]);

// 4. Aceptar solicitud
const aceptarSolicitud = async (solicitudId: string) => {
    const body = {
        he: 'HE-2024-001',
        empresa: 'travel',
        placa: placa, // Solo la placa!
        nombre_cuenta_cobro: 'Empresa Cliente',
        valor_cancelado: 800000,
        valor_a_facturar: 1200000,
        utilidad: 400000,
        porcentaje_utilidad: 33.33
    };
    
    const res = await fetch(`/api/v1/solicitudes/${solicitudId}/accept`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
    });
    
    const data = await res.json();
    
    if (res.ok) {
        console.log('Solicitud aceptada:', data);
        // Mostrar info del conductor y vehículo asignado
    }
};
```

### Componente de Preview del Vehículo

```tsx
// Componente para mostrar la previsualización
const VehiclePreview = ({ data }) => {
    if (!data) return null;
    
    const { vehicle, conductor, propietario } = data;
    
    return (
        <div className="vehicle-preview">
            {/* Información del Vehículo */}
            <div className="vehicle-info">
                <img src={vehicle.picture?.url} alt={vehicle.placa} />
                <h3>{vehicle.placa}</h3>
                <p>{vehicle.name}</p>
                <span className="badge">{vehicle.type}</span>
                <span className="badge">{vehicle.flota}</span>
                <p>{vehicle.seats} asientos</p>
            </div>
            
            {/* Información del Conductor */}
            {conductor && (
                <div className="conductor-info">
                    <img src={conductor.avatar?.url} alt={conductor.full_name} />
                    <h4>Conductor Asignado</h4>
                    <p>{conductor.full_name}</p>
                    <p>📞 {conductor.phone}</p>
                    <p>📧 {conductor.email}</p>
                </div>
            )}
            
            {/* Información del Propietario */}
            <div className="propietario-info">
                <h4>Propietario ({propietario.type})</h4>
                {propietario.company && (
                    <p>🏢 {propietario.company.company_name}</p>
                )}
                {propietario.user && (
                    <p>👤 {propietario.user.full_name}</p>
                )}
            </div>
        </div>
    );
};
```

---

## 📊 Resumen de Cambios

### Endpoints Nuevos

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/v1/solicitudes/vehicle/preview/:placa` | Previsualizar vehículo por placa |

### Endpoints Modificados

| Método | Ruta | Cambio |
|--------|------|--------|
| `PUT` | `/api/v1/solicitudes/:id/accept` | Ahora usa `placa` en lugar de `vehiculo_id` y `conductor_id` |

### Archivos Modificados

| Archivo | Cambio |
|---------|--------|
| `src/services/vehicles.service.ts` | Nuevo método `get_vehicle_by_placa` |
| `src/services/solicitudes.service.ts` | Modificado `accept_solicitud`, nuevo `preview_vehicle_by_placa` |
| `src/controllers/solicitudes.controller.ts` | Nuevo método `preview_vehicle_by_placa` |
| `src/routes/solicitudes.routes.ts` | Nueva ruta `/vehicle/preview/:placa` |

---

## ✨ Beneficios

1. **Simplifica el proceso** - Solo se necesita ingresar la placa
2. **Evita errores** - No hay que buscar IDs manualmente
3. **Previsualización** - Ver información antes de confirmar
4. **Conductor automático** - Se asigna según el vehículo
5. **Información completa** - Propietario incluido en la respuesta




