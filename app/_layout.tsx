import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { initDatabase } from '../db/database';
import '../global.css';

export default function Layout() {
    useEffect(() => {
        initDatabase();
    }, []);

    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" options={{ title: 'POS' }} />
            <Stack.Screen name="admin" options={{ title: 'Admin' }} />
            <Stack.Screen name="history" options={{ title: 'History', presentation: 'modal' }} />
        </Stack>
    );
}
