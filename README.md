# Grocery App - Sistema de Punto de Venta (POS)

Aplicación móvil desarrollada en **React Native (Expo)** para la gestión de una tienda de comestibles. Incluye funciones de punto de venta, inventario, gestión de usuarios e historial de transacciones.

## Desarrollador
**Nombre:** Juan Miguel Fernández Araya  
**Email:** fernandezarayajuanmiguel@gmail.com

## Características Principales

### 🛒 Punto de Venta (POS)
- **Escáner de Código de Barras**: Agrega productos rápidamente usando la cámara del dispositivo.
- **Búsqueda Manual**: Encuentra productos y clientes por nombre.
- **Carrito de Compras**: Gestión de cantidades y cálculo automático de totales en Colones (₡).
- **Interfaz Vertical**: Diseño optimizado para uso en modo retrato.

### 👥 Administración
- **Gestión de Productos**: Agrega, edita y elimina productos del inventario.
- **Gestión de Clientes**: Registra y administra la base de datos de clientes.
- **Seguridad**: Acceso protegido por contraseña/PIN simple para áreas administrativas.

### 📅 Historial
- **Registro de Ventas**: Visualiza todas las transacciones ordenadas por fecha.
- **Detalle de Compra**: Desglose completo de productos, cantidades y precios por transacción.

## Tecnologías Utilizadas
- **Core**: React Native, Expo, TypeScript.
- **Router**: Expo Router (Navegación basada en archivos).
- **Base de Datos**: Expo SQLite (Almacenamiento local persistente).
- **Estilos**: NativeWind v4 (TailwindCSS para React Native).
- **Animaciones**: React Native Reanimated.

## Instalación y Ejecución

1.  **Instalar dependencias:**
    ```bash
    npm install
    ```

2.  **Iniciar la aplicación:**
    Se recomienda usar el flag `-c` para limpiar la caché de Metro Bundler al iniciar.
    ```bash
    npx expo start -c
    ```

3.  **Probar en dispositivo:**
    Escanea el código QR generado con la aplicación **Expo Go** en tu dispositivo Android o iOS.
