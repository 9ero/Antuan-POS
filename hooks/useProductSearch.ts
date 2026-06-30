import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { User, Category, Product, getUsers, getProducts, getCategories } from '@/db/queries';

export const useProductSearch = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [u, p, c] = await Promise.all([getUsers(), getProducts(), getCategories()]);
            setUsers(u);
            setProducts(p);
            setCategories(c);
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

    return { users, products, categories, isLoading, refresh: loadData };
};
