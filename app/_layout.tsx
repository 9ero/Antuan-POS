import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { GluestackUIProvider, Text, Box } from '@gluestack-ui/themed';
import { config } from '@gluestack-ui/config';
import { initDatabase } from '@/db/database';
import '../global.css';

export default function Layout() {
    const [dbInitialized, setDbInitialized] = useState(false);

    useEffect(() => {
        const init = async () => {
            await initDatabase();
            setDbInitialized(true);
        };
        init();
    }, []);

    return (
        <GluestackUIProvider config={config}>
            {!dbInitialized ? (
                <Box flex={1} justifyContent="center" alignItems="center" bg="$white">
                    <Text>Cargando sistema...</Text>
                </Box>
            ) : (
                <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="index" options={{ title: 'POS' }} />
                    <Stack.Screen name="admin" options={{ title: 'Admin' }} />
                    <Stack.Screen name="history" options={{ title: 'History', presentation: 'modal' }} />
                </Stack>
            )}
        </GluestackUIProvider>
    );
}
