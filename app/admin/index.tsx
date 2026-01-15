import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AdminDashboard() {
    const router = useRouter();

    return (
        <SafeAreaView className="flex-1 bg-gray-50 p-6">
            <Stack.Screen options={{ headerShown: false }} />
            <Text className="text-3xl font-bold text-gray-800 mb-8">Panel de Admin</Text>

            <View className="gap-4">
                <TouchableOpacity
                    className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex-row items-center justify-between"
                    onPress={() => router.push('/admin/products')}
                >
                    <View>
                        <Text className="text-xl font-bold text-gray-800">Productos</Text>
                        <Text className="text-gray-500">Agregar, editar o eliminar</Text>
                    </View>
                    <Text className="text-2xl text-gray-400">→</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex-row items-center justify-between"
                    onPress={() => router.push('/admin/users')}
                >
                    <View>
                        <Text className="text-xl font-bold text-gray-800">Usuarios</Text>
                        <Text className="text-gray-500">Gestionar clientes</Text>
                    </View>
                    <Text className="text-2xl text-gray-400">→</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    className="bg-red-50 p-6 rounded-xl border border-red-100 mt-8"
                    onPress={() => router.replace('/')}
                >
                    <Text className="text-red-600 text-center font-bold">Salir de Admin</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}
