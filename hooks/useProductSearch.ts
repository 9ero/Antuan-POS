import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { User, Product, getUsers, getProducts } from '@/db/queries';

export const useProductSearch = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [u, p] = await Promise.all([getUsers(), getProducts()]);
            setUsers(u);
            setProducts(p);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [])
    );

    return { users, products, isLoading, refresh: loadData };
};
