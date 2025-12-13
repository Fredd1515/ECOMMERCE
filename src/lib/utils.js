import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
	return twMerge(clsx(inputs));
}

export function selectMonthlyOffers(products = [], count = 5, date = new Date()) {
	if (!Array.isArray(products) || products.length === 0) return products;

	const month = date.getUTCMonth() + 1; // 1-12
	const year = date.getUTCFullYear();
	const seed = year * 100 + month;

	// PRNG mulberry32 (pequeño y rápido) con semilla numérica
	function mulberry32(a) {
		return function() {
			a |= 0;
			a = a + 0x6D2B79F5 | 0;
			let t = Math.imul(a ^ a >>> 15, 1 | a);
			t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
			return ((t ^ t >>> 14) >>> 0) / 4294967296;
		};
	}

	const rand = mulberry32(seed);

	// Hacemos una copia y la barajamos usando el PRNG con semilla
	const arr = products.slice();
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		const tmp = arr[i];
		arr[i] = arr[j];
		arr[j] = tmp;
	}

	const selected = new Set(arr.slice(0, Math.min(count, arr.length)).map(p => p.id));

	// Devolver nuevos productos marcando onSale true para los seleccionados
	return products.map(p => ({ ...p, onSale: selected.has(p.id) }));
}
