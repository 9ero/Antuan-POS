import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import {
    GluestackUIProvider, Text, Box, Button, ButtonText, VStack, HStack,
    Heading, Input, InputField, Pressable, Spinner,
} from '@gluestack-ui/themed';
import { config } from '@gluestack-ui/config';
import { initDatabase } from '@/db/database';
import { isConfigured } from '@/db/turso';
import {
    getDeviceConfig, registerDevice, listDevices, restoreFromTurso,
    saveSetting, TursoDevice,
} from '@/db/sync';
import '../global.css';

type SetupStep = 'choice' | 'new-name' | 'restore-list' | 'restoring' | 'done';

export default function Layout() {
    const [dbReady, setDbReady] = useState(false);
    const [needsSetup, setNeedsSetup] = useState(false);
    const [step, setStep] = useState<SetupStep>('choice');
    const [deviceName, setDeviceName] = useState('');
    const [devices, setDevices] = useState<TursoDevice[]>([]);
    const [loadingDevices, setLoadingDevices] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        (async () => {
            await initDatabase();
            if (isConfigured) {
                const config = await getDeviceConfig();
                if (!config) {
                    setNeedsSetup(true);
                    setDbReady(true);
                    return;
                }
            }
            setDbReady(true);
        })();
    }, []);

    const handleNewDevice = async () => {
        const name = deviceName.trim();
        if (!name) { setError('Ingresá un nombre para este dispositivo'); return; }
        setSubmitting(true);
        setError('');
        try {
            const id = await registerDevice(name);
            await saveSetting('device_turso_id', String(id));
            await saveSetting('device_name', name);
            setNeedsSetup(false);
        } catch (e) {
            setError('Error al registrar: ' + (e instanceof Error ? e.message : 'Desconocido'));
        } finally {
            setSubmitting(false);
        }
    };

    const handleShowRestoreList = async () => {
        setStep('restore-list');
        setLoadingDevices(true);
        setError('');
        try {
            const list = await listDevices();
            setDevices(list);
        } catch (e) {
            setError('Error al cargar dispositivos: ' + (e instanceof Error ? e.message : 'Desconocido'));
        } finally {
            setLoadingDevices(false);
        }
    };

    const handleRestore = async (device: TursoDevice) => {
        setStep('restoring');
        setError('');
        try {
            await restoreFromTurso(device.id);
            await saveSetting('device_turso_id', String(device.id));
            await saveSetting('device_name', device.name);
            setNeedsSetup(false);
        } catch (e) {
            setError('Error al restaurar: ' + (e instanceof Error ? e.message : 'Desconocido'));
            setStep('restore-list');
        }
    };

    const fmtDate = (s: string | null) =>
        s ? new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z').toLocaleDateString('es-CR') : 'Sin cierres';

    if (!dbReady) {
        return (
            <GluestackUIProvider config={config}>
                <Box flex={1} justifyContent="center" alignItems="center" bg="$white">
                    <Text>Cargando sistema...</Text>
                </Box>
            </GluestackUIProvider>
        );
    }

    if (needsSetup) {
        return (
            <GluestackUIProvider config={config}>
                <Box flex={1} bg="$coolGray50" justifyContent="center" px="$6">
                    <VStack space="xl">
                        <VStack space="xs" alignItems="center" mb="$4">
                            <Heading size="2xl">Antuan POS</Heading>
                            <Text color="$coolGray500" textAlign="center">
                                Primera configuración del dispositivo
                            </Text>
                        </VStack>

                        {step === 'choice' && (
                            <VStack space="md">
                                <Button size="lg" onPress={() => setStep('new-name')}>
                                    <ButtonText numberOfLines={2} textAlign="center">
                                        Nuevo dispositivo
                                    </ButtonText>
                                </Button>
                                <Button size="lg" variant="outline" onPress={handleShowRestoreList}>
                                    <ButtonText>Restaurar copia existente</ButtonText>
                                </Button>
                            </VStack>
                        )}

                        {step === 'new-name' && (
                            <VStack space="md">
                                <Text fontWeight="$semibold">Nombre de este punto de venta:</Text>
                                <Input size="xl">
                                    <InputField
                                        placeholder="Ej: Punto de venta Chachagua"
                                        value={deviceName}
                                        onChangeText={setDeviceName}
                                        autoFocus
                                    />
                                </Input>
                                {error ? <Text color="$red500" size="sm">{error}</Text> : null}
                                <Button size="xl" onPress={handleNewDevice} isDisabled={submitting}>
                                    <ButtonText>{submitting ? 'Registrando...' : 'Comenzar'}</ButtonText>
                                </Button>
                                <Button size="lg" variant="link" onPress={() => { setStep('choice'); setError(''); }}>
                                    <ButtonText>Volver</ButtonText>
                                </Button>
                            </VStack>
                        )}

                        {step === 'restore-list' && (
                            <VStack space="md">
                                <Text fontWeight="$semibold">Seleccioná el dispositivo a restaurar:</Text>
                                {error ? <Text color="$red500" size="sm">{error}</Text> : null}
                                {loadingDevices ? (
                                    <Box alignItems="center" py="$6"><Spinner size="large" /></Box>
                                ) : devices.length === 0 ? (
                                    <Text color="$coolGray400" textAlign="center">No hay copias disponibles en la nube</Text>
                                ) : (
                                    <ScrollView style={{ maxHeight: 320 }}>
                                        <VStack space="sm">
                                            {devices.map(d => (
                                                <Pressable
                                                    key={d.id}
                                                    bg="$white"
                                                    p="$4"
                                                    borderRadius="$lg"
                                                    borderWidth={1}
                                                    borderColor="$coolGray200"
                                                    onPress={() => handleRestore(d)}
                                                >
                                                    <HStack justifyContent="space-between" alignItems="center">
                                                        <VStack>
                                                            <Text fontWeight="$semibold">{d.name}</Text>
                                                            <Text size="xs" color="$coolGray400">
                                                                Último cierre: {fmtDate(d.last_closing)}
                                                            </Text>
                                                        </VStack>
                                                        <Text color="$blue600">→</Text>
                                                    </HStack>
                                                </Pressable>
                                            ))}
                                        </VStack>
                                    </ScrollView>
                                )}
                                <Button size="lg" variant="link" onPress={() => { setStep('choice'); setError(''); }}>
                                    <ButtonText>Volver</ButtonText>
                                </Button>
                            </VStack>
                        )}

                        {step === 'restoring' && (
                            <VStack space="md" alignItems="center">
                                <Spinner size="large" />
                                <Text color="$coolGray500">Restaurando datos desde la nube...</Text>
                            </VStack>
                        )}
                    </VStack>
                </Box>
            </GluestackUIProvider>
        );
    }

    return (
        <GluestackUIProvider config={config}>
            <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" options={{ title: 'POS' }} />
                <Stack.Screen name="admin" options={{ title: 'Admin' }} />
                <Stack.Screen name="history" options={{ title: 'History', presentation: 'modal' }} />
            </Stack>
        </GluestackUIProvider>
    );
}
