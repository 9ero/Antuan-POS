import { useRouter, Stack } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ADMIN_PIN } from '@/utils/constants';
import {
    Box,
    Text,
    Button,
    ButtonText,
    Input,
    InputField,
    VStack,
    Heading,
    FormControl,
    FormControlLabel,
    FormControlLabelText,
} from '@gluestack-ui/themed';

export default function AdminLayout() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [pin, setPin] = useState('');
    const router = useRouter();

    const handleLogin = () => {
        if (pin === ADMIN_PIN) {
            setIsAuthenticated(true);
        } else {
            alert('PIN Incorrecto');
            setPin('');
        }
    };

    if (!isAuthenticated) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }}>
                <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Box w="$3/4" maxWidth={400}>
                        <Heading textAlign="center" mb="$8" size="2xl">Administración</Heading>
                        <FormControl mb="$6">
                            <FormControlLabel mb="$2">
                                <FormControlLabelText color="$coolGray600">Ingrese PIN de acceso</FormControlLabelText>
                            </FormControlLabel>
                            <Input size="xl">
                                <InputField
                                    secureTextEntry
                                    keyboardType="numeric"
                                    maxLength={4}
                                    value={pin}
                                    onChangeText={setPin}
                                    textAlign="center"
                                />
                            </Input>
                        </FormControl>

                        <Button onPress={handleLogin} size="xl" mb="$4">
                            <ButtonText>Ingresar</ButtonText>
                        </Button>
                        <Button onPress={() => router.back()} variant="outline" size="lg">
                            <ButtonText>Volver</ButtonText>
                        </Button>
                    </Box>
                </KeyboardAvoidingView>
            </SafeAreaView>
        );
    }

    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="products/index" options={{ title: 'Productos' }} />
            <Stack.Screen name="categories/index" options={{ title: 'Categorías' }} />
            <Stack.Screen name="users/index" options={{ title: 'Usuarios' }} />
            <Stack.Screen name="inventory/index" options={{ title: 'Inventario' }} />
            <Stack.Screen name="closing/index" options={{ title: 'Cierre de Caja' }} />
        </Stack>
    );
}
