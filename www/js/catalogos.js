// FacturaK v2 — catálogos del sistema (antes venían del servidor Flask/Jinja).
// "funciones" activa módulos por rubro: mesas, sinStock, peso, variantes, estaciones, creditos.
window.FACTURAK_ROLES = { admin: 'Administrador', vendedor: 'Vendedor', cajero: 'Cajero', autoservicio: 'Autoservicio' };

window.FACTURAK_METODOS = {
  efectivo_usd: 'Efectivo (USD)', efectivo_bs: 'Efectivo (Bs)', pago_movil: 'Pago Móvil',
  transferencia: 'Transferencia bancaria', punto_venta: 'Punto de venta (débito/crédito)', zelle: 'Zelle', binance: 'Binance / USDT'
};

window.FACTURAK_CATEGORIAS = {
  general: {
    nombre: 'Comercio general', descripcion: 'Bodegas, tiendas y negocios en general.',
    icono: 'M3 9l1.5-5h15L21 9M3 9h18M3 9v11h18V9M9 20v-6h6v6',
    chips: ['Punto de venta', 'Inventario', 'Clientes'], funciones: []
  },
  restaurante: {
    nombre: 'Restaurante / Comida', descripcion: 'Plano de mesas, comandas a cocina y cuentas por mesa.',
    icono: 'M7 3v8m-2-8v5a2 2 0 004 0V3m-2 8v10M17 21V3c-2.2 0-4 3-4 7.5V13h4',
    chips: ['Mesas', 'Comandas', 'Sin stock'], funciones: ['mesas', 'sinStock']
  },
  supermercado: {
    nombre: 'Supermercado / Charcutería', descripcion: 'Venta por unidad o por peso y lector de códigos.',
    icono: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z',
    chips: ['Venta por kg', 'Código de barras'], funciones: ['peso']
  },
  ropa: {
    nombre: 'Tienda de ropa / calzado', descripcion: 'Productos con modelos y tallas, stock por variante.',
    icono: 'M16 3l5 4-3 3-2-1v12H8V9l-2 1-3-3 5-4c1 1.5 2.3 2 4 2s3-.5 4-2z',
    chips: ['Tallas', 'Modelos'], funciones: ['variantes']
  },
  ciber: {
    nombre: 'Ciber / Sala de juegos', descripcion: 'Tiempo por estación con alarma y cobro.',
    icono: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    chips: ['Estaciones', 'Alarma'], funciones: ['estaciones']
  },
  creditos: {
    nombre: 'Ventas a crédito / Financiamiento', descripcion: 'Contabilidad de créditos: cuotas, intereses, moras y cobranza por WhatsApp.',
    icono: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
    chips: ['Cuotas', 'Moras', 'WhatsApp'], funciones: ['creditos']
  },
  servicios: {
    nombre: 'Servicios profesionales', descripcion: 'Cobro de servicios y citas, sin manejo de inventario físico.',
    icono: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
    chips: ['Sin inventario', 'Cobro rápido'], funciones: ['sinStock']
  },
  distribuidora: {
    nombre: 'Distribuidora / Mayorista', descripcion: 'Venta al mayor y al detal, con precios diferenciados por volumen.',
    icono: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
    chips: ['Precio mayor', 'Inventario'], funciones: []
  }
};

// Rubros antiguos que ya no existen y su equivalente actual (migración de datos v1 → v2)
window.FACTURAK_RUBROS_MIGRADOS = { electro: 'creditos' };
