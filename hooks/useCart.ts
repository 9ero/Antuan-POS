import { useState } from 'react';
import { Product, CartItem } from '../db/schemas';

export const useCart = () => {
    const [cart, setCart] = useState<CartItem[]>([]);

    const addToCart = (product: Product, quantityToAdd: number = 1) => {
        setCart(prev => {
            const existing = prev.find(item => item.id === product.id);

            // Validate stock
            const currentQty = existing ? existing.quantity : 0;
            if (currentQty + quantityToAdd > product.stock) {
                // Improve this: return error or handle it UI side. 
                // For now, we will handle in UI or simple Alert? 
                // Best to throw and catch in UI
                throw new Error(`Solo hay ${product.stock} unidades disponibles de ${product.name}`);
            }

            if (existing) {
                return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + quantityToAdd } : item);
            }
            return [...prev, { ...product, quantity: quantityToAdd }];
        });
    };

    const updateQuantity = (productId: number, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.id === productId) {
                const newQty = Math.max(0, item.quantity + delta);
                // We should also check stock limit here if delta is positive, but we need the product reference.
                // Assuming validation happens on add or simplified here.
                // Ideally we passed product or looked it up.
                // IMPORTANT: If stock is 5, and we have 5, delta +1 -> 6. 
                // We need to know max stock. 
                // Since CartItem extends Product, we HAVE stock in item (from initial add).
                if (delta > 0 && newQty > item.stock) {
                    return item; // Or throw?
                }
                return { ...item, quantity: newQty };
            }
            return item;
        }).filter(item => item.quantity > 0));
    };

    const clearCart = () => setCart([]);

    const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    return {
        cart,
        addToCart,
        updateQuantity,
        clearCart,
        cartTotal
    };
};
