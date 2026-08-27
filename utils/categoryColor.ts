import { Product } from '@/db/schemas';

// Ángulo dorado: distribuye los hues de forma perceptualmente máxima y nunca
// repite entre ids consecutivos. Determinístico (no Math.random()) para que
// cada categoría conserve siempre el mismo color entre reinicios de la app.
const HUE_STEP = 137.508;

export interface ColorPair {
    bg: string;
    border: string;
}

export const categoryColors = (categoryId: number): ColorPair => {
    const hue = (categoryId * HUE_STEP) % 360;
    return {
        bg: `hsl(${hue}, 45%, 95%)`,
        border: `hsl(${hue}, 45%, 78%)`,
    };
};

// Artesanales es un filtro derivado (sin código de barras), no una categoría
// real con id — color fijo, no entra en la rotación por ángulo dorado.
export const ARTESANAL_COLOR: ColorPair = { bg: 'hsl(38, 45%, 95%)', border: 'hsl(38, 45%, 78%)' };

export const NEUTRAL_COLOR: ColorPair = { bg: 'hsl(220, 15%, 97%)', border: 'hsl(220, 15%, 88%)' };

export const isArtesanal = (p: Product) => !p.barcode || p.barcode.trim() === '';

// Precedencia: artesanal domina sobre categoría (un producto puede ser ambos).
export const productColor = (p: Product): ColorPair => {
    if (isArtesanal(p)) return ARTESANAL_COLOR;
    if (p.category_id != null) return categoryColors(p.category_id);
    return NEUTRAL_COLOR;
};
