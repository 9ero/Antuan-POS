# 🛒 Antuan POS - Sistema de Punto de Venta

[![React Native](https://img.shields.io/badge/React%20Native-0.81-blue.svg)](https://reactnative.dev/)
[![Expo](https://img.shields.io/badge/Expo-SDK%2054-000020.svg)](https://expo.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

Sistema de punto de venta (POS) móvil desarrollado con **React Native** y **Expo**, diseñado para pequeños negocios y tiendas de abarrotes. Incluye gestión de inventario, clientes, historial de ventas y exportación a Excel.

---

## 👨‍💻 Desarrollador

**Juan Miguel Fernández Araya**  
📧 fernandezarayajuanmiguel@gmail.com

---

## ✨ Características Principales

### 🏪 Punto de Venta (POS)
- **Escáner de Código de Barras**: Agrega productos usando la cámara del dispositivo
- **Búsqueda Manual**: Encuentra productos y clientes fácilmente
- **Carrito Inteligente**: 
  - Gestión de cantidades con validación de stock
  - Cálculo automático de totales en Colones (₡)
  - Prevención de sobreventa
- **Interfaz Optimizada**: Diseño vertical con carrito fijo en la parte inferior
- **Confirmación Visual**: Modal de confirmación al escanear productos

### 📦 Gestión de Inventario
- **CRUD Completo**: Crear, leer, actualizar y eliminar productos
- **Control de Stock**: Sistema de inventario en tiempo real
- **Códigos de Barras**: Escáner integrado para registro rápido
- **Soft Delete**: Los productos eliminados se desactivan, no se borran
- **Reactivación Inteligente**: Reutiliza códigos de barras de productos eliminados
- **Validación**: Previene duplicación de códigos de barras activos

### 👥 Gestión de Clientes
- **Base de Datos de Clientes**: Registro completo de información
- **Edición en Línea**: Modifica datos de clientes existentes
- **Búsqueda Rápida**: Encuentra clientes por nombre

### 📊 Historial y Reportes
- **Registro de Ventas**: Visualiza todas las transacciones por fecha
- **Detalles Completos**: Productos, cantidades, precios y totales
- **Exportación Excel**: Genera reportes `.xlsx` con rango de fechas
- **Compartir**: Envía reportes por WhatsApp, email, etc.
- **Limpieza de Datos**: Borra historial con PIN de seguridad (1234)

### 🔒 Seguridad
- **Autenticación Admin**: PIN de acceso (por defecto: `1234`)
- **Protección de Datos**: Confirmación requerida para acciones críticas
- **SQLite Local**: Todos los datos se almacenan localmente en el dispositivo

---

## 🛠 Tecnologías Utilizadas

### Core
- **React Native** `0.81.5` - Framework principal
- **Expo** `~54.0.32` - Plataforma de desarrollo
- **TypeScript** `~5.9.2` - Type safety

### UI/UX
- **Gluestack UI** `^1.1.73` - Sistema de diseño moderno
- **NativeWind** `^4.2.1` - TailwindCSS para React Native
- **React Native Reanimated** `~4.1.1` - Animaciones fluidas

### Navegación y Estado
- **Expo Router** `~6.0.22` - File-based routing
- **React Hooks** - Gestión de estado (`useCart`, `useScanner`, `useProductSearch`)

### Base de Datos
- **Expo SQLite** `~16.0.10` - Almacenamiento local persistente
- **Zod** `^4.3.5` - Validación de schemas y tipos

### Funcionalidades
- **Expo Camera** `~17.0.10` - Escáner de códigos de barras
- **Expo FileSystem** `~19.0.21` - Manejo de archivos
- **Expo Sharing** `~14.0.8` - Compartir archivos
- **XLSX** `^0.18.5` - Generación de archivos Excel

---

## 📁 Estructura del Proyecto

```
Antuan-POS/
├── app/                        # Pantallas de la aplicación
│   ├── _layout.tsx            # Layout principal con provider
│   ├── index.tsx              # Pantalla de POS
│   ├── history.tsx            # Historial de ventas
│   └── admin/                 # Módulo de administración
│       ├── _layout.tsx        # Layout con autenticación
│       ├── index.tsx          # Dashboard admin
│       ├── products/
│       │   └── index.tsx      # Gestión de productos
│       └── users/
│           └── index.tsx      # Gestión de usuarios
├── db/                        # Capa de datos
│   ├── database.ts           # Inicialización de SQLite
│   ├── queries.ts            # Queries SQL
│   ├── schemas.ts            # Schemas Zod
│   └── types.ts              # Tipos TypeScript
├── hooks/                     # Custom React Hooks
│   ├── useCart.ts            # Lógica del carrito
│   ├── useScanner.ts         # Control de cámara
│   └── useProductSearch.ts   # Búsqueda de productos
├── assets/                    # Imágenes e iconos
├── package.json              # Dependencias
└── README.md                 # Este archivo
```

---

## 🚀 Instalación y Ejecución

### Prerrequisitos
- **Node.js** (v18+)
- **npm** o **yarn**
- **Expo Go** app en tu dispositivo móvil ([Android](https://play.google.com/store/apps/details?id=host.exp.exponent) | [iOS](https://apps.apple.com/app/expo-go/id982107779))

### Instalación

1. **Clonar el repositorio**
   ```bash
   git clone https://github.com/9ero/Antuan-POS.git
   cd Antuan-POS
   ```

2. **Instalar dependencias**
   ```bash
   npm install
   ```

3. **Iniciar la aplicación**
   ```bash
   npx expo start -c
   ```
   > El flag `-c` limpia la caché de Metro Bundler (recomendado)

4. **Probar en dispositivo**
   - Escanea el código QR con **Expo Go**
   - Alternativamente, usa `npx expo start --android` o `npx expo start --ios`

---

## 📱 Guía de Uso

### Realizar una Venta

1. **Seleccionar Cliente**: Busca y selecciona el cliente
2. **Agregar Productos**:
   - Escanea código de barras, o
   - Toca un producto de la cuadrícula
3. **Gestionar Cantidades**: Usa los botones `+` y `-` en el carrito
4. **Cobrar**: Presiona el botón "Cobrar" (requiere cliente y stock disponible)

### Administración

1. **Acceder**: Toca "Admin" → Ingresa PIN `1234`
2. **Productos**:
   - Presiona `+` para agregar
   - Toca ✏️ para editar
   - Toca 🗑️ para eliminar (soft delete)
3. **Usuarios**: Misma lógica que productos

### Exportar Historial

1. Ve a "Historial"
2. Toca "Exportar Excel"
3. Comparte el archivo generado

---

## 🗄️ Esquema de Base de Datos

### Tabla: `users`
| Campo       | Tipo    | Descripción                |
|-------------|---------|----------------------------|
| id          | INTEGER | Primary Key (Auto)         |
| name        | TEXT    | Nombre del cliente         |
| created_at  | TEXT    | Timestamp de creación      |

### Tabla: `products`
| Campo       | Tipo    | Descripción                |
|-------------|---------|----------------------------|
| id          | INTEGER | Primary Key (Auto)         |
| name        | TEXT    | Nombre del producto        |
| price       | REAL    | Precio en colones          |
| barcode     | TEXT    | Código de barras (único y opcional)   |
| stock       | INTEGER | Cantidad disponible        |
| is_active   | INTEGER | 1=Activo, 0=Eliminado (soft delete)     |
| created_at  | TEXT    | Timestamp de creación      |

### Tabla: `transactions`
| Campo       | Tipo    | Descripción                |
|-------------|---------|----------------------------|
| id          | INTEGER | Primary Key (Auto)         |
| user_id     | INTEGER | FK → users.id              |
| total       | REAL    | Total de la venta          |
| created_at  | TEXT    | Timestamp de venta         |

### Tabla: `transaction_items`
| Campo              | Tipo    | Descripción                |
|--------------------|---------|----------------------------|
| id                 | INTEGER | Primary Key (Auto)         |
| transaction_id     | INTEGER | FK → transactions.id       |
| product_id         | INTEGER | FK → products.id           |
| price_at_purchase  | REAL    | Precio al momento de venta |
| quantity           | INTEGER | Cantidad vendida           |

---

## 🔧 Scripts Disponibles

```bash
# Iniciar servidor de desarrollo
npm start

# Iniciar limpiando caché (recomendado)
npx expo start -c

# Abrir en Android
npm run android

# Abrir en iOS
npm run ios

# Verificar tipos TypeScript
npx tsc --noEmit

# Limpiar y reinstalar dependencias
rm -rf node_modules && npm install
```

---

## 🐛 Solución de Problemas

### Error: "SafeAreaView deprecated"
**Causa**: Advertencia de dependencias externas (Gluestack UI, Expo Router)  
**Solución**: Ignorar. El proyecto ya usa `react-native-safe-area-context`

### Error: "No such column: is_active"
**Causa**: Base de datos desactualizada  
**Solución**: La migración se ejecuta automáticamente al iniciar la app

### Vulnerabilidad en `xlsx`
**Causa**: Librería desactualizada con CVEs conocidos  
**Riesgo**: Bajo (solo generamos archivos, no los procesamos)  
**Solución**: Esperar actualización o migrar a `exceljs`

### Dependencias desactualizadas
```bash
npx expo install --fix
```

---

## 🎯 Roadmap / Mejoras Futuras

- [ ] Integración con impresora térmica Bluetooth
- [ ] Soporte multi-moneda
- [ ] Reportes gráficos (ventas por día/semana/mes)
- [ ] Backup automático en la nube
- [ ] Modo oscuro
- [ ] Soporte multi-idioma (i18n)
- [ ] Migrar de `xlsx` a `exceljs` (seguridad)
- [ ] Autenticación biométrica (Touch ID / Face ID)

---

## 📄 Licencia

Este proyecto está licenciado bajo **Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)**.

### ✅ Puedes:
- **Compartir** — copiar y redistribuir el material en cualquier medio o formato
- **Adaptar** — remezclar, transformar y construir sobre el material

### ⚠️ Bajo los siguientes términos:
- **Atribución** — Debes dar crédito apropiado, proporcionar un enlace a la licencia e indicar si se realizaron cambios
- **No Comercial** — No puedes usar el material con fines comerciales
- **Compartir Igual** — Si remezclas, transformas o construyes sobre el material, debes distribuir tus contribuciones bajo la misma licencia

📜 **Licencia completa:** [LICENSE](./LICENSE)  
🔗 **Más información:** https://creativecommons.org/licenses/by-nc-sa/4.0/

---

## 🤝 Contribuciones

¡Las contribuciones son bienvenidas! Si tienes sugerencias, encuentras bugs o quieres agregar funcionalidades:

1. **Fork** el proyecto
2. Crea una **rama** para tu feature (`git checkout -b feature/AmazingFeature`)
3. **Commit** tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. **Push** a la rama (`git push origin feature/AmazingFeature`)
5. Abre un **Pull Request**

**Nota:** Recuerda que cualquier contribución debe respetar la licencia CC BY-NC-SA 4.0 (sin uso comercial).

---

## 📞 Contacto

**Juan Miguel Fernández Araya**  
📧 fernandezarayajuanmiguel@gmail.com  
🔗 [GitHub: 9ero](https://github.com/9ero)

---

**Desarrollado con ❤️ en Costa Rica 🇨🇷**
