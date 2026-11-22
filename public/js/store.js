// Estado global: usuario actual y carrito (el carrito vive en el navegador; los precios los calcula el servidor).
import { api } from './api.js';

const KEY = 'komatsu.cart.v1';
const listeners = new Set();
export const state = { user: null, cart: load() };

function load() {
  try { const v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v : []; } catch { return []; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state.cart)); } catch { /* modo privado */ }
  emit();
}
export const onChange = fn => listeners.add(fn);
const emit = () => listeners.forEach(fn => fn(state));

export async function refreshUser() {
  try { state.user = (await api('/auth/me')).user; } catch { state.user = null; }
  emit();
  return state.user;
}
export const isMember = () => !!state.user?.member;
export const isAdmin = () => state.user?.role === 'admin';

export const cartCount = () => state.cart.reduce((n, i) => n + i.qty, 0);
export function addToCart(slug, qty = 1) {
  const it = state.cart.find(i => i.slug === slug);
  if (it) it.qty = Math.min(12, it.qty + qty); else state.cart.push({ slug, qty: Math.min(12, qty) });
  save();
}
export function setQty(slug, qty) {
  state.cart = qty > 0 ? state.cart.map(i => i.slug === slug ? { ...i, qty: Math.min(12, qty) } : i) : state.cart.filter(i => i.slug !== slug);
  save();
}
export function clearCart() { state.cart = []; save(); }
