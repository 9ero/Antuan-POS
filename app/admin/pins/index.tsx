import { Share } from 'react-native';
import { Stack } from 'expo-router';
import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { getActivePins, createCheckoutPin, deleteCheckoutPin, CheckoutPin } from '@/db/queries';
import { generatePin } from '@/utils/pin';
import {
    Box,
    Text,
    Button,
    ButtonText,
    VStack,
    HStack,
    Heading,
    Card,
    ScrollView,
    Input,
    InputField,
    Fab,
    FabIcon,
    AddIcon,
    Pressable,
    Icon,
    TrashIcon,
    FormControl,
    FormControlLabel,
    FormControlLabelText,
} from '@gluestack-ui/themed';

export default function PinsAdmin() {
    const [pins, setPins] = useState<CheckoutPin[]>([]);
    const [manualPin, setManualPin] = useState('');
    const [error, setError] = useState('');

    const loadPins = async () => {
        const data = await getActivePins();
        setPins(data);
    };

    useFocusEffect(useCallback(() => { loadPins(); }, []));

    const handleGenerate = async () => {
        const pin = generatePin();
        try {
            await createCheckoutPin(pin);
            loadPins();
        } catch {
            setError('Error al generar el PIN');
        }
    };

    const handleManualAdd = async () => {
        const cleaned = manualPin.trim().toUpperCase();
        if (cleaned.length !== 4) {
            setError('El PIN debe tener exactamente 4 caracteres');
            return;
        }
        try {
            await createCheckoutPin(cleaned);
            setManualPin('');
            setError('');
            loadPins();
        } catch {
            setError('Ese PIN ya existe o hubo un error');
        }
    };

    const handleShare = async (pin: string) => {
        await Share.share({ message: `Tu PIN de compra: ${pin}` });
    };

    const handleDelete = async (id: number) => {
        await deleteCheckoutPin(id);
        loadPins();
    };

    return (
        <Box flex={1} bg="$coolGray50">
            <Stack.Screen options={{ title: 'PINs de Compra', headerShown: true }} />

            <ScrollView contentContainerStyle={{ padding: 16 }}>
                <VStack space="lg">
                    {/* Manual PIN input */}
                    <Card p="$4" variant="elevated">
                        <Heading size="sm" mb="$3">PIN manual</Heading>
                        <HStack space="sm" alignItems="flex-end">
                            <FormControl flex={1}>
                                <FormControlLabel>
                                    <FormControlLabelText>4 caracteres (letras o números)</FormControlLabelText>
                                </FormControlLabel>
                                <Input>
                                    <InputField
                                        value={manualPin}
                                        onChangeText={t => { setManualPin(t.toUpperCase()); setError(''); }}
                                        maxLength={4}
                                        autoCapitalize="characters"
                                        placeholder="Ej: A3K9"
                                    />
                                </Input>
                            </FormControl>
                            <Button onPress={handleManualAdd} mb="$0.5">
                                <ButtonText>Agregar</ButtonText>
                            </Button>
                        </HStack>
                        {error ? <Text size="sm" color="$red500" mt="$2">{error}</Text> : null}
                    </Card>

                    {/* Active PINs list */}
                    <VStack space="sm">
                        <Heading size="sm" color="$coolGray600">
                            PINs disponibles ({pins.length})
                        </Heading>

                        {pins.length === 0 && (
                            <Box alignItems="center" py="$6">
                                <Text color="$coolGray400">No hay PINs activos. Genera uno con el botón +</Text>
                            </Box>
                        )}

                        {pins.map(p => (
                            <Card key={p.id} variant="elevated" p="$4">
                                <HStack justifyContent="space-between" alignItems="center">
                                    <VStack>
                                        <Text fontWeight="$bold" size="2xl" letterSpacing={8} color="$blue700">
                                            {p.pin}
                                        </Text>
                                        <Text size="xs" color="$coolGray400">
                                            {new Date(p.created_at).toLocaleString('es-CR')}
                                        </Text>
                                    </VStack>
                                    <HStack space="md" alignItems="center">
                                        <Button
                                            size="sm"
                                            onPress={() => handleShare(p.pin)}
                                            bg="$blue600"
                                        >
                                            <ButtonText>Compartir</ButtonText>
                                        </Button>
                                        <Pressable onPress={() => handleDelete(p.id)}>
                                            <Icon as={TrashIcon} color="$red500" size="lg" />
                                        </Pressable>
                                    </HStack>
                                </HStack>
                            </Card>
                        ))}
                    </VStack>
                </VStack>
            </ScrollView>

            <Fab
                size="lg"
                placement="bottom right"
                isHovered={false}
                isDisabled={false}
                isPressed={false}
                onPress={handleGenerate}
                bg="$blue600"
            >
                <FabIcon as={AddIcon} />
            </Fab>
        </Box>
    );
}
