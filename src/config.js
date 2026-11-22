// Parámetros de negocio (montos en pesos argentinos, enteros).
export const CONFIG = {
  membershipMonthly: Number(process.env.MEMBERSHIP_PRICE || 20000),
  shippingFlat: Number(process.env.SHIPPING_FLAT || 5000),
  freeShippingFrom: Number(process.env.FREE_SHIPPING_FROM || 60000),
  maxQtyPerItem: 12,
  maxReservaPerOrder: 2, // tope por pedido para productos exclusivos del Club
  sessionDays: 30,
  shortSessionHours: 12,
};
