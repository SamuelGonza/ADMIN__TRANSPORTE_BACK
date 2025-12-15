# 📋 Documentación de Interfaces y Tipos - Contracts

Este documento describe todas las interfaces y tipos definidos en `src/contracts/`, que representan la estructura de datos del sistema de administración de transporte.

## Tabla de Contenidos

1. [Tipos Globales](#tipos-globales)
2. [Interfaces de Usuario](#interfaces-de-usuario)
3. [Interfaces de Compañía](#interfaces-de-compañía)
4. [Interfaces de Cliente](#interfaces-de-cliente)
5. [Interfaces de Vehículos](#interfaces-de-vehículos)
6. [Interfaces de Documentos](#interfaces-de-documentos)
7. [Interfaces de Contratos](#interfaces-de-contratos)
8. [Interfaces de Servicios](#interfaces-de-servicios)
9. [Interfaces de Bitácora](#interfaces-de-bitácora)
10. [Interfaces de Ubicaciones](#interfaces-de-ubicaciones)

---

## Tipos Globales

### `MediaTypes`

Tipo global que representa archivos multimedia almacenados (imágenes, PDFs, documentos).

**Ubicación:** `src/contracts/globals.ts`

```typescript
export type MediaTypes = {
    url: string;                    // URL pública del archivo
    public_id: string;               // ID público en Cloudinary
    type: string;                    // Tipo de archivo (img, pdf, doc, etc.)
    original_name?: string;          // Nombre original del archivo
    file_extension?: string;         // Extensión del archivo
}
```

**Ejemplo:**

```json
{
    "url": "https://res.cloudinary.com/example/image/upload/v1234567890/vehicles/abc123.jpg",
    "public_id": "vehicles/abc123",
    "type": "img",
    "original_name": "bus_foto.jpg",
    "file_extension": ".jpg"
}
```

---

## Interfaces de Usuario

### `User`

Representa un usuario del sistema con sus datos personales, autenticación y permisos.

**Ubicación:** `src/contracts/interfaces/user.interface.ts`

```typescript
export interface User extends Document {
    full_name: string;               // Nombre completo del usuario
    document: {
        type: UserDocuments;          // Tipo de documento
        number: number;                // Número de documento
    };
    avatar: MediaTypes;                // Foto de perfil
    role: UserRoles;                  // Rol del usuario en el sistema
    
    contact: {
        email: string;                 // Email de contacto
        phone: string;                 // Teléfono de contacto
        address: string;               // Dirección
    };
    
    email: string;                     // Email de acceso (login)
    password: string;                  // Contraseña hasheada
    
    company_id: ObjectId;             // ID de la compañía a la que pertenece
    otp_recovery: number;              // Código OTP para recuperación de contraseña
    created: Date;                     // Fecha de creación
    is_active: boolean;                // Estado activo/inactivo
    is_delete: boolean;                // Soft delete (eliminación lógica)
}
```

**Tipos Relacionados:**

#### `UserDocuments`

Tipo de documento de identidad válido en Colombia.

```typescript
export type UserDocuments = "cc" | "ce" | "psp" | "ti" | "nit";
```

| Valor | Descripción |
|-------|-------------|
| `cc` | Cédula de Ciudadanía |
| `ce` | Cédula de Extranjería |
| `psp` | Pasaporte |
| `ti` | Tarjeta de Identidad |
| `nit` | Número de Identificación Tributaria |

#### `UserRoles`

Roles disponibles en el sistema.

```typescript
export type UserRoles = "superadmon" | "admin" | "coordinador" | "comercial" | 
                        "contabilidad" | "operador" | "conductor" | "cliente";
```

| Rol | Descripción |
|-----|-------------|
| `superadmon` | Super administrador (acceso total) |
| `admin` | Administrador de empresa |
| `coordinador` | Coordinador de operaciones |
| `comercial` | Usuario comercial |
| `contabilidad` | Usuario de contabilidad |
| `operador` | Operador de servicios |
| `conductor` | Conductor de vehículos |
| `cliente` | Cliente del sistema |

**Ejemplo:**

```json
{
    "_id": "64f8a1b2c3d4e5f6g7h8i9j0",
    "full_name": "Juan Pérez",
    "document": {
        "type": "cc",
        "number": 1234567890
    },
    "avatar": {
        "url": "https://cloudinary.com/avatar.jpg",
        "public_id": "users/juan_perez",
        "type": "img"
    },
    "role": "conductor",
    "contact": {
        "email": "juan@example.com",
        "phone": "3001234567",
        "address": "Calle 123 #45-67"
    },
    "email": "juan@example.com",
    "password": "$2b$10$hashed...",
    "company_id": "64f8a1b2c3d4e5f6g7h8i9j1",
    "otp_recovery": 0,
    "created": "2024-01-15T10:30:00.000Z",
    "is_active": true,
    "is_delete": false
}
```

---

### `DriverDocuments`

Documentos legales y administrativos de un conductor.

**Ubicación:** `src/contracts/interfaces/driver_documents.interface.ts`

```typescript
export interface DriverDocuments extends Document {
    driver_id: ObjectId;               // ID del conductor (referencia a User)
    
    // Documentos de identidad
    document: {
        back: MediaTypes;              // Reverso de documento
        front: MediaTypes;             // Frente de documento
    };
    
    // Licencia de conducción
    licencia_conduccion: {
        back: MediaTypes;              // Reverso de licencia
        front: MediaTypes;             // Frente de licencia
    };
    
    // Metadatos de licencia de conducción
    licencia_conduccion_numero?: string;
    licencia_conduccion_categoria?: ColombiaLicenseCategory;
    licencia_conduccion_estado?: string;
    licencia_conduccion_expedicion?: Date;
    licencia_conduccion_vencimiento?: Date;
    
    // Datos personales básicos
    lugar_expedicion_documento?: string;
    fecha_nacimiento?: Date;
    lugar_nacimiento?: string;
    estado_civil?: string;
    tipo_sangre?: ColombiaBloodType;
    genero?: ColombiaGender;
    direccion?: string;
    barrio?: string;
    ciudad?: string;
    telefono?: string;
    telefono_celular?: string;
    email_personal?: string;
    
    // Información bancaria
    entidad_bancaria?: string;
    tipo_cuenta?: BankAccountType;
    cuenta_numero?: string;
    
    // Información laboral
    empresa_contratante?: string;
    tipo_contrato?: string;
    condicion_empresa?: string;       // Ej: PROPIETARIO
    fecha_vinculacion?: Date;
    cargo_asignado?: string;
    lugar_trabajo?: string;
    proceso_asignado?: string;
    
    // Seguridad y salud en el trabajo (SST)
    sst?: {
        eps?: { 
            entidad?: string; 
            cobertura?: Date 
        };
        arl?: { 
            entidad?: string; 
            cobertura?: Date 
        };
        riesgos_profesionales?: { 
            entidad?: string; 
            cobertura?: Date 
        };
        fondo_pensiones?: { 
            entidad?: string; 
            cobertura?: Date 
        };
        caja_compensacion?: { 
            entidad?: string; 
            cobertura?: Date 
        };
    };
    
    // Examen médico ocupacional
    ips_examen_medico?: {
        entidad?: string;
        fecha_ultimo_examen?: Date;
        fecha_vencimiento_examen?: Date;
        fecha_vencimiento_recomendaciones?: Date;
        recomendaciones_medicas?: string;
    };
    
    // Inducción / Reinducción
    induccion?: {
        fecha_induccion?: Date;
        fecha_reinduccion?: Date;
    };
    
    // Firma digital
    firma_digital?: MediaTypes;
}
```

**Tipos Relacionados:**

#### `ColombiaLicenseCategory`

Categorías de licencia de conducción en Colombia.

```typescript
export type ColombiaLicenseCategory = "A1" | "A2" | "B1" | "B2" | "B3" | "C1" | "C2" | "C3";
```

| Categoría | Descripción |
|-----------|-------------|
| `A1` | Motocicletas hasta 125cc |
| `A2` | Motocicletas mayores a 125cc |
| `B1` | Automóviles particulares |
| `B2` | Camionetas y camperos |
| `B3` | Vehículos de servicio público |
| `C1` | Vehículos de carga hasta 3500kg |
| `C2` | Vehículos de carga hasta 7500kg |
| `C3` | Vehículos de carga mayores a 7500kg |

#### `ColombiaBloodType`

Tipos de sangre válidos.

```typescript
export type ColombiaBloodType = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";
```

#### `ColombiaGender`

Géneros válidos.

```typescript
export type ColombiaGender = "M" | "F" | "Otro";
```

#### `BankAccountType`

Tipos de cuenta bancaria.

```typescript
export type BankAccountType = "ahorros" | "corriente" | "otro";
```

---

## Interfaces de Compañía

### `Companies`

Representa una compañía de transporte.

**Ubicación:** `src/contracts/interfaces/company.interface.ts`

```typescript
export interface Companies extends Document {
    company_name: string;            // Nombre de la compañía
    document: {
        type: UserDocuments;          // Tipo de documento (NIT)
        number: number;                // Número de documento
        dv: string;                   // Dígito verificador
    };
    simba_token?: string;             // Token de integración con Simba
    fe_id_ref?: string;               // Referencia de facturación electrónica
    logo: MediaTypes;                  // Logo de la compañía
    created: Date;                    // Fecha de creación
}
```

**Ejemplo:**

```json
{
    "_id": "64f8a1b2c3d4e5f6g7h8i9j1",
    "company_name": "Transportes ABC S.A.S",
    "document": {
        "type": "nit",
        "number": 900123456,
        "dv": "7"
    },
    "simba_token": "token_abc123",
    "fe_id_ref": "FE-REF-001",
    "logo": {
        "url": "https://cloudinary.com/logo.jpg",
        "public_id": "companies/abc_logo",
        "type": "img"
    },
    "created": "2024-01-01T00:00:00.000Z"
}
```

---

## Interfaces de Cliente

### `Client`

Representa un cliente de la compañía de transporte.

**Ubicación:** `src/contracts/interfaces/client.interface.ts`

```typescript
export interface Client extends Document {
    company_id: ObjectId;             // ID de la compañía de transporte
    name: string;                     // Nombre de la empresa cliente
    
    phone: string;                    // Teléfono principal
    contact_name: string;             // Nombre de la persona de contacto
    contact_phone: string;            // Teléfono del contacto
    
    email: string;                    // Email de acceso
    password: string;                 // Contraseña hasheada
    
    created: Date;                    // Fecha de creación
}
```

**Ejemplo:**

```json
{
    "_id": "64f8a1b2c3d4e5f6g7h8i9j2",
    "company_id": "64f8a1b2c3d4e5f6g7h8i9j1",
    "name": "Empresa Cliente S.A.S",
    "phone": "6012345678",
    "contact_name": "Pedro López",
    "contact_phone": "3001234567",
    "email": "pedro@empresacliente.com",
    "password": "$2b$10$hashed...",
    "created": "2024-01-15T10:30:00.000Z"
}
```

---

## Interfaces de Vehículos

### `Vehicle`

Representa un vehículo de la flota.

**Ubicación:** `src/contracts/interfaces/vehicles.interface.ts`

```typescript
export interface Vehicle extends Document {
    driver_id: ObjectId;               // ID del conductor asignado
    possible_drivers?: ObjectId[];    // IDs de conductores alternativos
    n_numero_interno?: string;        // Número interno del vehículo
    placa: string;                    // Placa del vehículo
    name?: string;                     // Nombre/alias del vehículo
    description?: string;              // Descripción del vehículo
    seats: number;                     // Número de asientos
    flota: VehicleFlota;               // Tipo de flota
    created: Date;                      // Fecha de creación
    type: VehicleTypes;                // Tipo de vehículo
    picture: MediaTypes;                // Foto del vehículo
    
    // Ficha técnica
    technical_sheet?: {
        licencia_transito_numero?: string;
        linea?: string;
        cilindrada_cc?: number;
        servicio?: string;
        carroceria?: string;
        capacidad_pasajeros?: number;
        capacidad_toneladas?: number;
        numero_chasis?: string;
        fecha_matricula?: Date;
        tarjeta_operacion_numero?: string;
        tarjeta_operacion_vencimiento?: Date;
        titular_licencia?: string;
        marca?: string;
        modelo?: number;
        color?: string;
        tipo_combustible?: string;
        numero_motor?: string;
        numero_serie?: string;
        declaracion_importacion?: string;
    };
    
    // Propietario
    owner_id: {
        type: "Company" | "User";     // Tipo de propietario
        company_id: ObjectId;          // ID de compañía (si aplica)
        user_id: ObjectId;             // ID de usuario (si aplica)
    };
}
```

**Tipos Relacionados:**

#### `VehicleTypes`

Tipos de vehículos disponibles.

```typescript
export type VehicleTypes = "bus" | "buseta" | "buseton" | "camioneta" | 
                           "campero" | "micro" | "van";
```

| Tipo | Descripción |
|------|-------------|
| `bus` | Bus de gran capacidad |
| `buseta` | Buseta mediana |
| `buseton` | Busetón grande |
| `camioneta` | Camioneta |
| `campero` | Campero/SUV |
| `micro` | Microbús |
| `van` | Van/Furgoneta |

#### `VehicleFlota`

Tipos de pertenencia del vehículo a la flota.

```typescript
export type VehicleFlota = "externo" | "propio" | "afiliado";
```

| Tipo | Descripción |
|------|-------------|
| `externo` | Vehículo externo/tercero |
| `propio` | Vehículo propio de la empresa |
| `afiliado` | Vehículo afiliado |

**Ejemplo:**

```json
{
    "_id": "64f8a1b2c3d4e5f6g7h8i9j3",
    "driver_id": "64f8a1b2c3d4e5f6g7h8i9j0",
    "possible_drivers": [],
    "n_numero_interno": "001",
    "placa": "ABC123",
    "name": "Bus Ejecutivo 1",
    "description": "Bus con aire acondicionado",
    "seats": 40,
    "flota": "propio",
    "type": "bus",
    "picture": {
        "url": "https://cloudinary.com/bus.jpg",
        "public_id": "vehicles/abc123",
        "type": "img"
    },
    "technical_sheet": {
        "marca": "Mercedes-Benz",
        "modelo": 2020,
        "color": "Blanco",
        "tipo_combustible": "Diesel"
    },
    "owner_id": {
        "type": "Company",
        "company_id": "64f8a1b2c3d4e5f6g7h8i9j1",
        "user_id": null
    },
    "created": "2024-01-15T10:30:00.000Z"
}
```

---

### `VehicleDocuments`

Documentos legales de un vehículo.

**Ubicación:** `src/contracts/interfaces/vehicle_documents.interface.ts`

```typescript
export interface VehicleDocuments extends Document {
    vehicle_id: ObjectId;              // ID del vehículo
    
    soat: MediaTypes;                  // SOAT (Seguro Obligatorio de Accidentes de Tránsito)
    tecnomecanica: MediaTypes;         // Certificado técnico-mecánica
    seguro: MediaTypes;                // Seguro adicional
    licencia_transito: MediaTypes;     // Licencia de tránsito
    runt: MediaTypes;                  // RUNT (Registro Único Nacional de Tránsito)
    
    // Fechas de vencimiento
    soat_vencimiento?: Date;
    tecnomecanica_vencimiento?: Date;
    seguro_vencimiento?: Date;
    tarjeta_operacion_vencimiento?: Date;
}
```

**Ejemplo:**

```json
{
    "_id": "64f8a1b2c3d4e5f6g7h8i9j4",
    "vehicle_id": "64f8a1b2c3d4e5f6g7h8i9j3",
    "soat": {
        "url": "https://cloudinary.com/soat.pdf",
        "public_id": "documents/soat_abc123",
        "type": "pdf"
    },
    "tecnomecanica": {
        "url": "https://cloudinary.com/tecnomecanica.pdf",
        "public_id": "documents/tecnomecanica_abc123",
        "type": "pdf"
    },
    "seguro": {
        "url": "https://cloudinary.com/seguro.pdf",
        "public_id": "documents/seguro_abc123",
        "type": "pdf"
    },
    "licencia_transito": {
        "url": "https://cloudinary.com/licencia.pdf",
        "public_id": "documents/licencia_abc123",
        "type": "pdf"
    },
    "runt": {
        "url": "https://cloudinary.com/runt.pdf",
        "public_id": "documents/runt_abc123",
        "type": "pdf"
    },
    "soat_vencimiento": "2025-06-15T00:00:00.000Z",
    "tecnomecanica_vencimiento": "2025-03-20T00:00:00.000Z",
    "seguro_vencimiento": "2025-12-31T00:00:00.000Z",
    "tarjeta_operacion_vencimiento": "2025-01-15T00:00:00.000Z"
}
```

---

### `VehiclePreoperational`

Reporte preoperacional de un vehículo (inspección antes del servicio).

**Ubicación:** `src/contracts/interfaces/vehicle_preop.interface.ts`

```typescript
export interface VehiclePreoperational extends Document {
    vehicle_id: ObjectId;              // ID del vehículo
    created: Date;                     // Fecha de creación del reporte
    reports: PreOpReport[];           // Array de reportes individuales
    uploaded_by: ObjectId;             // ID del usuario que creó el reporte
}
```

**Tipos Relacionados:**

#### `PreOpReport`

Reporte individual dentro de un preoperacional.

```typescript
export type PreOpReport = {
    media: MediaTypes[];              // Archivos multimedia (fotos, videos)
    description: string;               // Descripción del elemento revisado
    status: "ok" | "details" | "failures";  // Estado del elemento
    uploaded: Date;                    // Fecha de carga
}
```

| Estado | Descripción |
|--------|-------------|
| `ok` | Todo en orden |
| `details` | Requiere atención pero no es crítico |
| `failures` | Fallas detectadas |

**Ejemplo:**

```json
{
    "_id": "64f8a1b2c3d4e5f6g7h8i9j5",
    "vehicle_id": "64f8a1b2c3d4e5f6g7h8i9j3",
    "created": "2024-01-20T07:30:00.000Z",
    "reports": [
        {
            "description": "Estado de llantas",
            "status": "ok",
            "media": [],
            "uploaded": "2024-01-20T07:30:00.000Z"
        },
        {
            "description": "Nivel de aceite",
            "status": "details",
            "media": [
                {
                    "url": "https://cloudinary.com/oil.jpg",
                    "public_id": "preop/oil_abc123",
                    "type": "img"
                }
            ],
            "uploaded": "2024-01-20T07:30:00.000Z"
        }
    ],
    "uploaded_by": "64f8a1b2c3d4e5f6g7h8i9j0"
}
```

---

### `VehicleOperational`

Registro de gastos operacionales de un vehículo.

**Ubicación:** `src/contracts/interfaces/vehicle_opera.interface.ts`

```typescript
export interface VehicleOperational extends Document {
    vehicle_id: ObjectId;              // ID del vehículo
    solicitud_id?: ObjectId;           // ID de la solicitud vinculada (opcional)
    bills: VehicleBills[];              // Array de gastos
    created: Date;                     // Fecha de creación
    uploaded_by: ObjectId;             // ID del usuario que registró los gastos
}
```

**Tipos Relacionados:**

#### `VehicleBills`

Gasto individual dentro de un registro operacional.

```typescript
export type VehicleBills = {
    type_bill: "fuel" | "tolls" | "repairs" | "fines" | "parking_lot";
    value: number;                     // Valor del gasto en COP
    description: string;               // Descripción del gasto
    media_support: MediaTypes[];       // Soportes (facturas, recibos, etc.)
    uploaded: Date;                    // Fecha de carga
}
```

| Tipo | Descripción |
|------|-------------|
| `fuel` | Combustible |
| `tolls` | Peajes |
| `repairs` | Reparaciones |
| `fines` | Multas |
| `parking_lot` | Parqueaderos |

**Ejemplo:**

```json
{
    "_id": "64f8a1b2c3d4e5f6g7h8i9j6",
    "vehicle_id": "64f8a1b2c3d4e5f6g7h8i9j3",
    "solicitud_id": "64f8a1b2c3d4e5f6g7h8i9j7",
    "created": "2024-01-20T08:00:00.000Z",
    "bills": [
        {
            "type_bill": "fuel",
            "value": 150000,
            "description": "Tanqueo completo estación Terpel",
            "media_support": [
                {
                    "url": "https://cloudinary.com/receipt.jpg",
                    "public_id": "bills/receipt_001",
                    "type": "img"
                }
            ],
            "uploaded": "2024-01-20T08:00:00.000Z"
        },
        {
            "type_bill": "tolls",
            "value": 45000,
            "description": "Peajes ruta Bogotá-Medellín",
            "media_support": [],
            "uploaded": "2024-01-20T08:00:00.000Z"
        }
    ],
    "uploaded_by": "64f8a1b2c3d4e5f6g7h8i9j0"
}
```

---

## Interfaces de Contratos

### `Contract`

Representa un contrato entre la compañía y un cliente.

**Ubicación:** `src/contracts/interfaces/contract.interface.ts`

```typescript
export interface Contract extends Document {
    company_id: ObjectId;              // ID de la compañía
    client_id: ObjectId;               // ID del cliente
    
    tipo_contrato: ContractType;       // Tipo de contrato
    
    // Tarifario / modo de cobro
    cobro?: {
        modo_default?: ContractPricingMode;
        por_hora?: number;             // COP por hora
        por_kilometro?: number;        // COP por km
        por_distancia?: number;        // COP por trayecto (valor fijo)
        tarifa_amva?: number;          // COP por tarifa AMVA (valor fijo)
    };
    
    // Presupuesto/consumo
    periodo_presupuesto?: ContractBudgetPeriod;
    valor_presupuesto?: number | null; // Presupuesto asignado
    valor_consumido: number;           // Valor consumido hasta el momento
    
    historico: ContractHistoryEvent[]; // Historial de eventos
    
    is_active: boolean;                 // Contrato activo/inactivo
    created: Date;                     // Fecha de creación
    created_by?: ObjectId;             // ID del usuario que creó el contrato
}
```

**Tipos Relacionados:**

#### `ContractType`

Tipos de contrato disponibles.

```typescript
export type ContractType = "fijo" | "ocasional";
```

| Tipo | Descripción |
|------|-------------|
| `fijo` | Contrato con presupuesto fijo |
| `ocasional` | Contrato sin presupuesto (pago por servicio) |

#### `ContractBudgetPeriod`

Períodos de presupuesto.

```typescript
export type ContractBudgetPeriod = "anio" | "mes" | "semana" | "dia";
```

#### `ContractPricingMode`

Modos de cobro/pricing.

```typescript
export type ContractPricingMode = "por_hora" | "por_kilometro" | 
                                  "por_distancia" | "tarifa_amva";
```

| Modo | Descripción |
|------|-------------|
| `por_hora` | Cobro por horas de servicio |
| `por_kilometro` | Cobro por kilómetros recorridos |
| `por_distancia` | Cobro por trayecto (valor fijo) |
| `tarifa_amva` | Cobro por tarifa AMVA (valor fijo) |

#### `ContractHistoryEvent`

Evento en el historial del contrato.

```typescript
export interface ContractHistoryEvent {
    type: ContractHistoryEventType;
    created: Date;
    created_by?: ObjectId;
    notes?: string;
    
    // Valores antes/después (para auditar)
    prev_valor_presupuesto?: number | null;
    new_valor_presupuesto?: number | null;
    prev_valor_consumido?: number;
    new_valor_consumido?: number;
    
    // Para cargos por servicio
    solicitud_id?: ObjectId;
    amount?: number;
    mode?: "within_contract" | "outside_contract";
}
```

#### `ContractHistoryEventType`

Tipos de eventos en el historial.

```typescript
export type ContractHistoryEventType = "budget_set" | "service_charge" | "manual_adjust";
```

| Tipo | Descripción |
|------|-------------|
| `budget_set` | Establecimiento de presupuesto |
| `service_charge` | Cargo por servicio |
| `manual_adjust` | Ajuste manual |

**Ejemplo:**

```json
{
    "_id": "64f8a1b2c3d4e5f6g7h8i9j8",
    "company_id": "64f8a1b2c3d4e5f6g7h8i9j1",
    "client_id": "64f8a1b2c3d4e5f6g7h8i9j2",
    "tipo_contrato": "fijo",
    "cobro": {
        "modo_default": "por_hora",
        "por_hora": 50000,
        "por_kilometro": 2000
    },
    "periodo_presupuesto": "mes",
    "valor_presupuesto": 5000000,
    "valor_consumido": 2500000,
    "historico": [
        {
            "type": "budget_set",
            "created": "2024-01-01T00:00:00.000Z",
            "created_by": "64f8a1b2c3d4e5f6g7h8i9j0",
            "new_valor_presupuesto": 5000000,
            "notes": "Presupuesto mensual establecido"
        }
    ],
    "is_active": true,
    "created": "2024-01-01T00:00:00.000Z",
    "created_by": "64f8a1b2c3d4e5f6g7h8i9j0"
}
```

---

## Interfaces de Servicios

### `Services`

Representa un servicio o producto ofrecido por la compañía.

**Ubicación:** `src/contracts/interfaces/services.interface.ts`

```typescript
export interface Services extends Document {
    code: string;                     // Código del servicio
    name: string;                      // Nombre del servicio
    description: string;               // Descripción del servicio
    value: number;                     // Valor del servicio
    company_id: ObjectId;             // ID de la compañía
}
```

**Ejemplo:**

```json
{
    "_id": "64f8a1b2c3d4e5f6g7h8i9j9",
    "code": "SRV-001",
    "name": "Transporte Ejecutivo",
    "description": "Servicio de transporte ejecutivo con vehículos de alta gama",
    "value": 100000,
    "company_id": "64f8a1b2c3d4e5f6g7h8i9j1"
}
```

---

## Interfaces de Bitácora

### `Bitacora`

Representa una bitácora mensual de servicios.

**Ubicación:** `src/contracts/interfaces/bitacora.interface.ts`

```typescript
export interface Bitacora extends Document {
    company_id: ObjectId;             // ID de la compañía
    year: string;                      // Año (ej: "2024")
    month: string;                     // Mes (ej: "01", "02", etc.)
    created: Date;                     // Fecha de creación
}
```

**Ejemplo:**

```json
{
    "_id": "64f8a1b2c3d4e5f6g7h8i9j10",
    "company_id": "64f8a1b2c3d4e5f6g7h8i9j1",
    "year": "2024",
    "month": "01",
    "created": "2024-01-01T00:00:00.000Z"
}
```

---

### `BitacoraSolicitud`

Representa una solicitud de servicio dentro de una bitácora.

**Ubicación:** `src/contracts/interfaces/bitacora.interface.ts`

```typescript
export interface BitacoraSolicitud extends Document {
    bitacora_id: ObjectId;              // ID de la bitácora
    
    // Información básica del servicio
    he: string;                         // HE (código de servicio)
    empresa: "travel" | "national" | string;  // EMPRESA
    fecha: Date;                        // FECHA
    hora_inicio: string;                // HORA (inicio)
    hora_final: string;                 // HORA (final)
    total_horas: number;                 // Total de horas
    
    // Cliente y contacto
    cliente: ObjectId;                  // CLIENTE (referencia a modelo de clientes)
    contacto: string;                   // CONTACTO
    
    // Ruta
    origen: string;                     // ORIGEN
    destino: string;                    // DESTINO
    novedades: string;                  // NOVEDADES
    origen_location_id?: ObjectId;      // ID de ubicación de origen
    destino_location_id?: ObjectId;     // ID de ubicación de destino
    
    // Estimación de precio
    estimated_km?: number;
    estimated_hours?: number;
    pricing_mode?: ContractPricingMode;
    pricing_rate?: number;
    estimated_price?: number;
    
    // Vehículo y conductor
    vehiculo_id: ObjectId;              // Referencia al vehículo
    placa: string;                      // PLACA (denormalizado)
    tipo_vehiculo: VehicleTypes | string;  // TIPO DE VEHÍCULO (denormalizado)
    n_pasajeros: number;                // N° PASAJEROS
    flota: VehicleFlota | string;      // FLOTA (denormalizado)
    conductor: ObjectId;                // CONDUCTOR (referencia al usuario)
    conductor_phone: string;             // Teléfono del conductor (denormalizado)
    
    // Multi-vehículo (cuando un servicio requiere varios buses)
    requested_passengers?: number;      // Total de pasajeros requerido
    vehicle_assignments?: Array<{
        vehiculo_id: ObjectId;
        placa: string;
        seats: number;
        assigned_passengers: number;
        conductor_id: ObjectId;
        conductor_phone?: string;
        
        // "Contrato" por bus
        contract_id?: ObjectId;
        contract_charge_mode?: "within_contract" | "outside_contract" | "no_contract";
        contract_charge_amount?: number;
        
        // Control contable por bus
        accounting?: {
            prefactura?: { numero?: string; fecha?: Date };
            preliquidacion?: { numero?: string; fecha?: Date };
            factura?: { numero?: string; fecha?: Date };
            doc_equivalente?: { numero?: string; fecha?: Date };
            pagos?: Array<{ fecha?: Date; valor?: number; referencia?: string }>;
            notas?: string;
        };
    }>;
    
    // Información financiera - Gastos
    nombre_cuenta_cobro: string;       // NOMBRE CUENTA DE COBRO
    valor_cancelado: number;           // VALOR CANCELADO
    doc_soporte: string;               // DOC SOPORTE
    fecha_cancelado: Date;             // FECHA CANCELADO
    n_egreso: string;                  // N° EGRESO
    
    // Información financiera - Ingresos
    valor_a_facturar: number;          // VALOR A FACTURAR
    n_factura: string;                  // N° FACTURA
    fecha_factura?: Date;              // FECHA de factura
    
    // Utilidad
    utilidad: number;                   // UTILIDAD (valor)
    porcentaje_utilidad: number;        // % (porcentaje de utilidad)
    total_gastos_operacionales?: number;  // Suma de gastos operacionales
    valor_documento_equivalente?: number;  // Valor para documento equivalente
    
    // Contratos (presupuesto/consumo)
    contract_id?: ObjectId;
    contract_charge_mode?: "within_contract" | "outside_contract" | "no_contract";
    contract_charge_amount?: number;
    
    // Metadata
    created: Date;
    created_by?: ObjectId;              // Usuario que creó el registro
    status: "pending" | "accepted" | "rejected";  // Estado de aprobación
    service_status: "not-started" | "started" | "finished";  // Estado de ejecución
}
```

**Estados:**

#### `status` (Estado de Aprobación)

| Estado | Descripción |
|--------|-------------|
| `pending` | Pendiente de aprobación |
| `accepted` | Aprobada |
| `rejected` | Rechazada |

#### `service_status` (Estado de Ejecución)

| Estado | Descripción |
|--------|-------------|
| `not-started` | Servicio no iniciado |
| `started` | Servicio en curso |
| `finished` | Servicio finalizado |

**Ejemplo:**

```json
{
    "_id": "64f8a1b2c3d4e5f6g7h8i9j7",
    "bitacora_id": "64f8a1b2c3d4e5f6g7h8i9j10",
    "he": "HE-2024-001",
    "empresa": "travel",
    "fecha": "2024-01-15T00:00:00.000Z",
    "hora_inicio": "08:00",
    "hora_final": "16:00",
    "total_horas": 8,
    "cliente": "64f8a1b2c3d4e5f6g7h8i9j2",
    "contacto": "Pedro López - 3001234567",
    "origen": "Bogotá",
    "destino": "Medellín",
    "novedades": "Servicio completado sin novedades",
    "origen_location_id": "64f8a1b2c3d4e5f6g7h8i9j11",
    "destino_location_id": "64f8a1b2c3d4e5f6g7h8i9j12",
    "estimated_km": 400,
    "estimated_hours": 8,
    "pricing_mode": "por_hora",
    "pricing_rate": 50000,
    "estimated_price": 400000,
    "vehiculo_id": "64f8a1b2c3d4e5f6g7h8i9j3",
    "placa": "ABC123",
    "tipo_vehiculo": "bus",
    "n_pasajeros": 35,
    "flota": "propio",
    "conductor": "64f8a1b2c3d4e5f6g7h8i9j0",
    "conductor_phone": "3001234567",
    "nombre_cuenta_cobro": "Cuenta de cobro 001",
    "valor_cancelado": 400000,
    "doc_soporte": "DOC-001",
    "fecha_cancelado": "2024-01-15T00:00:00.000Z",
    "n_egreso": "EGR-001",
    "valor_a_facturar": 500000,
    "n_factura": "FAC-2024-0001",
    "fecha_factura": "2024-01-18T00:00:00.000Z",
    "utilidad": 100000,
    "porcentaje_utilidad": 20,
    "total_gastos_operacionales": 50000,
    "contract_id": "64f8a1b2c3d4e5f6g7h8i9j8",
    "contract_charge_mode": "within_contract",
    "contract_charge_amount": 400000,
    "created": "2024-01-15T00:00:00.000Z",
    "created_by": "64f8a1b2c3d4e5f6g7h8i9j0",
    "status": "accepted",
    "service_status": "finished"
}
```

---

## Interfaces de Ubicaciones

### `Location`

Representa una ubicación (origen o destino) utilizada en los servicios.

**Ubicación:** `src/contracts/interfaces/location.interface.ts`

```typescript
export interface Location extends Document {
    company_id: ObjectId;             // ID de la compañía
    name: string;                      // Nombre de la ubicación (texto original)
    normalized_name: string;           // Nombre normalizado (para búsquedas)
    created: Date;                     // Fecha de creación
    last_used?: Date;                  // Última vez que se usó
    usage_count: number;               // Contador de uso
}
```

**Ejemplo:**

```json
{
    "_id": "64f8a1b2c3d4e5f6g7h8i9j11",
    "company_id": "64f8a1b2c3d4e5f6g7h8i9j1",
    "name": "Bogotá - Terminal de Transportes",
    "normalized_name": "bogota terminal de transportes",
    "created": "2024-01-01T00:00:00.000Z",
    "last_used": "2024-01-20T00:00:00.000Z",
    "usage_count": 15
}
```

---

## Resumen de Tipos y Enums

### Tipos de Documentos

| Tipo | Valores |
|------|---------|
| `UserDocuments` | `"cc"`, `"ce"`, `"psp"`, `"ti"`, `"nit"` |
| `ColombiaLicenseCategory` | `"A1"`, `"A2"`, `"B1"`, `"B2"`, `"B3"`, `"C1"`, `"C2"`, `"C3"` |
| `ColombiaBloodType` | `"A+"`, `"A-"`, `"B+"`, `"B-"`, `"AB+"`, `"AB-"`, `"O+"`, `"O-"` |
| `ColombiaGender` | `"M"`, `"F"`, `"Otro"` |
| `BankAccountType` | `"ahorros"`, `"corriente"`, `"otro"` |

### Tipos de Roles

| Tipo | Valores |
|------|---------|
| `UserRoles` | `"superadmon"`, `"admin"`, `"coordinador"`, `"comercial"`, `"contabilidad"`, `"operador"`, `"conductor"`, `"cliente"` |

### Tipos de Vehículos

| Tipo | Valores |
|------|---------|
| `VehicleTypes` | `"bus"`, `"buseta"`, `"buseton"`, `"camioneta"`, `"campero"`, `"micro"`, `"van"` |
| `VehicleFlota` | `"externo"`, `"propio"`, `"afiliado"` |

### Tipos de Contratos

| Tipo | Valores |
|------|---------|
| `ContractType` | `"fijo"`, `"ocasional"` |
| `ContractBudgetPeriod` | `"anio"`, `"mes"`, `"semana"`, `"dia"` |
| `ContractPricingMode` | `"por_hora"`, `"por_kilometro"`, `"por_distancia"`, `"tarifa_amva"` |
| `ContractHistoryEventType` | `"budget_set"`, `"service_charge"`, `"manual_adjust"` |

### Tipos de Gastos

| Tipo | Valores |
|------|---------|
| `VehicleBills.type_bill` | `"fuel"`, `"tolls"`, `"repairs"`, `"fines"`, `"parking_lot"` |

### Tipos de Estados

| Tipo | Valores |
|------|---------|
| `PreOpReport.status` | `"ok"`, `"details"`, `"failures"` |
| `BitacoraSolicitud.status` | `"pending"`, `"accepted"`, `"rejected"` |
| `BitacoraSolicitud.service_status` | `"not-started"`, `"started"`, `"finished"` |

---

## Relaciones entre Interfaces

### Jerarquía de Entidades

```
Company (Compañía)
├── User (Usuarios)
│   └── DriverDocuments (Documentos de conductor)
├── Client (Clientes)
├── Vehicle (Vehículos)
│   ├── VehicleDocuments (Documentos del vehículo)
│   ├── VehiclePreoperational (Reportes preoperacionales)
│   └── VehicleOperational (Gastos operacionales)
├── Contract (Contratos)
│   └── ContractHistoryEvent (Historial)
├── Services (Servicios)
├── Location (Ubicaciones)
└── Bitacora (Bitácoras)
    └── BitacoraSolicitud (Solicitudes de servicio)
```

### Referencias Cruzadas

- **User** → `company_id` → **Companies**
- **Client** → `company_id` → **Companies**
- **Vehicle** → `driver_id` → **User**
- **Vehicle** → `owner_id.company_id` → **Companies**
- **Vehicle** → `owner_id.user_id` → **User**
- **VehicleDocuments** → `vehicle_id` → **Vehicle**
- **VehiclePreoperational** → `vehicle_id` → **Vehicle**
- **VehiclePreoperational** → `uploaded_by` → **User**
- **VehicleOperational** → `vehicle_id` → **Vehicle**
- **VehicleOperational** → `solicitud_id` → **BitacoraSolicitud**
- **VehicleOperational** → `uploaded_by` → **User**
- **Contract** → `company_id` → **Companies**
- **Contract** → `client_id` → **Client**
- **Bitacora** → `company_id` → **Companies**
- **BitacoraSolicitud** → `bitacora_id` → **Bitacora**
- **BitacoraSolicitud** → `cliente` → **Client**
- **BitacoraSolicitud** → `vehiculo_id` → **Vehicle**
- **BitacoraSolicitud** → `conductor` → **User**
- **BitacoraSolicitud** → `contract_id` → **Contract**
- **Location** → `company_id` → **Companies**

---

## Notas Importantes

### ObjectId

Todas las referencias a otras entidades utilizan `ObjectId` de Mongoose, que se convierte automáticamente a string en JSON.

### Document

Todas las interfaces extienden `Document` de Mongoose, lo que significa que incluyen automáticamente campos como `_id`, `__v`, y métodos de Mongoose.

### Campos Opcionales

Los campos marcados con `?` son opcionales y pueden ser `undefined` o no estar presentes en el documento.

### Denormalización

Algunos campos están denormalizados (como `placa`, `tipo_vehiculo`, `flota` en `BitacoraSolicitud`) para facilitar búsquedas y reportes sin necesidad de hacer `populate`.

### Fechas

Todas las fechas se almacenan como objetos `Date` de JavaScript y se serializan como strings ISO 8601 en JSON.

---

**Última actualización:** Enero 2024

