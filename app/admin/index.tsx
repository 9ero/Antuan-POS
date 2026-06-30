import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { isConfigured } from '@/db/turso';
import { getDeviceConfig, pushToTurso, getSetting } from '@/db/sync';
import { dbResult } from '@/db/database';

const __DEV__ = process.env.NODE_ENV !== 'production';

export default function AdminDashboard() {
    const router = useRouter();
    const [deviceName, setDeviceName] = useState<string | null>(null);
    const [lastSync, setLastSync] = useState<string | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [syncMsg, setSyncMsg] = useState('');

    useEffect(() => {
        Promise.all([getDeviceConfig(), getSetting('last_sync_at')]).then(([cfg, sync]) => {
            setDeviceName(cfg?.deviceName ?? null);
            setLastSync(sync);
        });
    }, []);

    const handleSync = async () => {
        setSyncing(true);
        setSyncMsg('');
        try {
            const cfg = await getDeviceConfig();
            if (!cfg) throw new Error('Dispositivo no configurado');
            await pushToTurso(cfg.deviceId);
            const now = new Date().toISOString();
            setLastSync(now);
            setSyncMsg('✓ Respaldo completado');
        } catch (e) {
            setSyncMsg('✗ Error: ' + (e instanceof Error ? e.message : 'Desconocido'));
        } finally {
            setSyncing(false);
        }
    };

    const fmtSync = (s: string | null) =>
        s ? new Date(s).toLocaleString('es-CR') : 'Nunca';

    return (
        <SafeAreaView className="flex-1 bg-gray-50 p-6">
            <Stack.Screen options={{ headerShown: false }} />
            <Text className="text-3xl font-bold text-gray-800 mb-2">Panel de Admin</Text>
            {deviceName && (
                <Text className="text-sm text-gray-400 mb-6">{deviceName}</Text>
            )}

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
                    onPress={() => router.push('/admin/categories')}
                >
                    <View>
                        <Text className="text-xl font-bold text-gray-800">Categorías</Text>
                        <Text className="text-gray-500">Crear, renombrar, activar o desactivar</Text>
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
                    className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex-row items-center justify-between"
                    onPress={() => router.push('/admin/inventory')}
                >
                    <View>
                        <Text className="text-xl font-bold text-gray-800">Inventario</Text>
                        <Text className="text-gray-500">Stock, recepciones y faltantes</Text>
                    </View>
                    <Text className="text-2xl text-gray-400">→</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex-row items-center justify-between"
                    onPress={() => router.push('/admin/closing')}
                >
                    <View>
                        <Text className="text-xl font-bold text-gray-800">Cierre de Caja</Text>
                        <Text className="text-gray-500">Reporte del período y cierre</Text>
                    </View>
                    <Text className="text-2xl text-gray-400">→</Text>
                </TouchableOpacity>

                {isConfigured && (
                    <TouchableOpacity
                        className="bg-blue-50 p-5 rounded-xl border border-blue-100 flex-row items-center justify-between"
                        onPress={handleSync}
                        disabled={syncing}
                    >
                        <View>
                            <Text className="text-lg font-bold text-blue-700">
                                {syncing ? 'Respaldando...' : 'Respaldar en la nube'}
                            </Text>
                            <Text className="text-blue-400 text-xs">
                                {syncMsg || `Último: ${fmtSync(lastSync)}`}
                            </Text>
                        </View>
                        {syncing
                            ? <ActivityIndicator color="#3b82f6" />
                            : <Text className="text-2xl text-blue-300">↑</Text>
                        }
                    </TouchableOpacity>
                )}

                <TouchableOpacity
                    className="bg-red-50 p-6 rounded-xl border border-red-100 mt-4"
                    onPress={() => router.replace('/')}
                >
                    <Text className="text-red-600 text-center font-bold">Salir de Admin</Text>
                </TouchableOpacity>

                {__DEV__ && (
                    <TouchableOpacity
                        className="p-3 mt-2"
                        onPress={() => Alert.alert(
                            'Reset (dev)',
                            '¿Qué querés borrar?',
                            [
                                { text: 'Cancelar', style: 'cancel' },
                                {
                                    text: 'Solo config Turso',
                                    onPress: async () => {
                                        await dbResult.execAsync('DELETE FROM settings');
                                        Alert.alert('Listo', 'Reiniciá la app para ver la pantalla de configuración. Los datos locales quedan intactos.');
                                    },
                                },
                                {
                                    text: 'Todo (wipe completo)',
                                    style: 'destructive',
                                    onPress: async () => {
                                        await dbResult.execAsync(`
                                            DELETE FROM transaction_items;
                                            DELETE FROM transactions;
                                            DELETE FROM stock_movements;
                                            DELETE FROM cash_closings;
                                            DELETE FROM checkout_pins;
                                            DELETE FROM users;
                                            DELETE FROM products;
                                            DELETE FROM categories;
                                            DELETE FROM settings;
                                        `);
                                        Alert.alert('Listo', 'Base de datos local vaciada. Reiniciá la app.');
                                    },
                                },
                            ]
                        )}
                    >
                        <Text className="text-gray-300 text-center text-xs">⚙ Reset (dev)</Text>
                    </TouchableOpacity>
                )}
            </View>
        </SafeAreaView>
    );
}
