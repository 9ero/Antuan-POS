import { useState } from 'react';
import { Product, CartItem } from '@/db/schemas';

export const useCart = () => {
    const [cart, setCart] = useState<CartItem[]>([]);

    // Devuelve false si no hay stock suficiente. NUNCA lanzar desde el updater de
    // setCart: React puede ejecutarlo durante el render (fuera del try/catch del
    // onPress) y un throw ahí tumba la app en el APK.
    const addToCart = (product: Product, quantityToAdd: number = 1): boolean => {
        const existing = cart.find(item => item.id === product.id);
        const currentQty = existing ? existing.quantity : 0;
        if (currentQty + quantityToAdd > product.stock) {
            return false;
        }

        setCart(prev => {
            const prevItem = prev.find(item => item.id === product.id);
            const prevQty = prevItem ? prevItem.quantity : 0;
            // Re-chequeo dentro del updater: taps muy rápidos en el mismo batch
            // ven un `cart` desactualizado arriba; aquí se clampa sin romper.
            if (prevQty + quantityToAdd > product.stock) {
                return prev;
            }
            if (prevItem) {
                return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + quantityToAdd } : item);
            }
            return [...prev, { ...product, quantity: quantityToAdd }];
        });
        return true;
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
