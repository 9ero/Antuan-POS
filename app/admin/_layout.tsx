import { useRouter, Stack } from 'expo-router';
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AdminLayout() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [pin, setPin] = useState('');
    const router = useRouter();

    const handleLogin = () => {
        if (pin === '1234') {
            setIsAuthenticated(true);
        } else {
            alert('PIN Incorrecto');
            setPin('');
        }
    };

    if (!isAuthenticated) {
        return (
            <SafeAreaView className="flex-1 bg-white justify-center items-center">
                <View className="w-4/5">
                    <Text className="text-2xl font-bold text-center mb-8">Administración</Text>
                    <Text className="mb-2 text-gray-600">Ingrese PIN de acceso:</Text>
                    <TextInput
                        className="border border-gray-300 rounded-lg p-4 text-center text-xl mb-4"
                        secureTextEntry
                        keyboardType="numeric"
                        maxLength={4}
                        value={pin}
                        onChangeText={setPin}
                    />
                    <TouchableOpacity
                        className="bg-blue-600 p-4 rounded-lg"
                        onPress={handleLogin}
                    >
                        <Text className="text-white text-center font-bold text-lg">Ingresar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        className="mt-4 p-4"
                        onPress={() => router.back()}
                    >
                        <Text className="text-blue-600 text-center">Volver</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="products/index" options={{ title: 'Productos' }} />
            <Stack.Screen name="users/index" options={{ title: 'Usuarios' }} />
        </Stack>
    );
}
