import { Modal, Share, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { useState, useCallback } from 'react';
import { User, CheckoutPin, getUsers, addUser, deleteUser, updateUser, getPinsWithUsers, createCheckoutPin, deleteCheckoutPin } from '@/db/queries';
import { generatePin } from '@/utils/pin';
import { useFocusEffect } from 'expo-router';
import {
    Box,
    Text,
    Button,
    ButtonText,
    Input,
    InputField,
    VStack,
    HStack,
    Pressable,
    Heading,
    Card,
    ScrollView,
    Fab,
    FabIcon,
    AddIcon,
    TrashIcon,
    Icon,
    FormControl,
    FormControlLabel,
    FormControlLabelText,
    EditIcon,
    Divider,
} from '@gluestack-ui/themed';

export default function UsersAdmin() {
    const [users, setUsers] = useState<User[]>([]);
    const [pinsMap, setPinsMap] = useState<Map<number, CheckoutPin>>(new Map());

    // User add/edit modal
    const [userModalVisible, setUserModalVisible] = useState(false);
    const [newName, setNewName] = useState('');
    const [editingId, setEditingId] = useState<number | null>(null);

    const [isSubmitting, setIsSubmitting] = useState(false);

    // PIN UI state
    const [expandedPinUserId, setExpandedPinUserId] = useState<number | null>(null);
    const [manualPinUserId, setManualPinUserId] = useState<number | null>(null);
    const [manualPinInput, setManualPinInput] = useState('');
    const [manualPinError, setManualPinError] = useState('');

    const loadAll = async () => {
        const [us, ps] = await Promise.all([getUsers(), getPinsWithUsers()]);
        setUsers(us);
        setPinsMap(new Map(ps.map(p => [p.user_id, p])));
    };

    useFocusEffect(useCallback(() => { loadAll(); }, []));

    // User CRUD
    const handleSaveUser = async () => {
        if (!newName) { alert('El nombre es requerido'); return; }
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            if (editingId) {
                await updateUser(editingId, newName);
            } else {
                await addUser(newName);
            }
            setUserModalVisible(false);
            setNewName('');
            setEditingId(null);
            loadAll();
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEditUser = (user: User) => {
        setNewName(user.name);
        setEditingId(user.id!);
        setUserModalVisible(true);
    };

    const handleDeleteUser = async (id: number) => {
        await deleteCheckoutPin(id);
        await deleteUser(id);
        loadAll();
    };

    // PIN actions
    const handleAutoPin = async (userId: number) => {
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            await createCheckoutPin(generatePin(), userId);
            setExpandedPinUserId(null);
            loadAll();
        } finally {
            setIsSubmitting(false);
        }
    };

    const openManualPin = (userId: number) => {
        setManualPinInput('');
        setManualPinError('');
        setManualPinUserId(userId);
        setExpandedPinUserId(null);
    };

    const handleSaveManualPin = async () => {
        const cleaned = manualPinInput.trim().toUpperCase();
        if (cleaned.length !== 4) {
            setManualPinError('Debe tener exactamente 4 caracteres');
            return;
        }
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            await createCheckoutPin(cleaned, manualPinUserId!);
            setManualPinUserId(null);
            loadAll();
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSharePin = async (pin: string, userName: string) => {
        await Share.share({ message: `PIN de compra para ${userName}: ${pin}` });
    };

    const handleRemovePin = async (userId: number) => {
        await deleteCheckoutPin(userId);
        loadAll();
    };

    return (
        <Box flex={1} bg="$coolGray50">
            <Stack.Screen options={{ title: 'Gestionar Usuarios', headerShown: true }} />

            <ScrollView contentContainerStyle={{ padding: 16 }}>
                <VStack space="md">
                    {users.map(item => {
                        const pin = pinsMap.get(item.id!);
                        const isExpanded = expandedPinUserId === item.id;

                        return (
                            <Card key={item.id} variant="elevated" p="$4">
                                {/* User name + edit/delete */}
                                <HStack justifyContent="space-between" alignItems="center" mb="$3">
                                    <Heading size="sm">{item.name}</Heading>
                                    <HStack space="md">
                                        <Pressable onPress={() => handleEditUser(item)}>
                                            <Icon as={EditIcon} color="$blue600" size="xl" />
                                        </Pressable>
                                        <Pressable onPress={() => handleDeleteUser(item.id!)}>
                                            <Icon as={TrashIcon} color="$red600" size="xl" />
                                        </Pressable>
                                    </HStack>
                                </HStack>

                                <Divider mb="$3" />

                                {/* PIN section — vertical layout */}
                                <VStack space="sm">
                                    <Text size="xs" color="$coolGray400">PIN de compra</Text>

                                    {/* PIN value */}
                                    {pin ? (
                                        <Text fontWeight="$bold" size="2xl" color="$blue700" letterSpacing={8}>
                                            {pin.pin}
                                        </Text>
                                    ) : (
                                        <Text color="$coolGray400" size="sm">Sin PIN asignado</Text>
                                    )}

                                    {/* Share + remove (only if pin exists) */}
                                    {pin && (
                                        <HStack space="sm" mt="$1">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                flex={1}
                                                onPress={() => handleSharePin(pin.pin, item.name)}
                                            >
                                                <ButtonText>Compartir</ButtonText>
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                action="negative"
                                                onPress={() => handleRemovePin(item.id!)}
                                            >
                                                <ButtonText color="$red500">Eliminar</ButtonText>
                                            </Button>
                                        </HStack>
                                    )}

                                    {/* Generate PIN toggle */}
                                    {!isExpanded ? (
                                        <Button
                                            size="sm"
                                            bg="$blue600"
                                            mt="$1"
                                            onPress={() => setExpandedPinUserId(item.id!)}
                                        >
                                            <ButtonText>{pin ? 'Nuevo PIN  ▾' : 'Generar PIN  ▾'}</ButtonText>
                                        </Button>
                                    ) : (
                                        <HStack space="sm" mt="$1">
                                            <Button
                                                size="sm"
                                                bg="$blue600"
                                                flex={1}
                                                isDisabled={isSubmitting}
                                                onPress={() => handleAutoPin(item.id!)}
                                            >
                                                <ButtonText>Automático</ButtonText>
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                flex={1}
                                                onPress={() => openManualPin(item.id!)}
                                            >
                                                <ButtonText>Manual</ButtonText>
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="link"
                                                onPress={() => setExpandedPinUserId(null)}
                                            >
                                                <ButtonText color="$coolGray400">✕</ButtonText>
                                            </Button>
                                        </HStack>
                                    )}
                                </VStack>
                            </Card>
                        );
                    })}
                </VStack>
            </ScrollView>

            <Fab
                size="lg"
                placement="bottom right"
                isHovered={false}
                isDisabled={false}
                isPressed={false}
                onPress={() => { setEditingId(null); setNewName(''); setUserModalVisible(true); }}
                bg="$blue600"
            >
                <FabIcon as={AddIcon} />
            </Fab>

            {/* Add/Edit user modal */}
            <Modal visible={userModalVisible} animationType="slide" transparent>
                <Box flex={1} justifyContent="flex-end" bg="$black" opacity={0.5} style={StyleSheet.absoluteFillObject} />
                <Box flex={1} justifyContent="flex-end">
                    <Box bg="$white" borderTopLeftRadius="$2xl" borderTopRightRadius="$2xl" p="$6">
                        <Heading size="lg" mb="$4">{editingId ? 'Editar Usuario' : 'Nuevo Usuario'}</Heading>
                        <FormControl mb="$6">
                            <FormControlLabel><FormControlLabelText>Nombre</FormControlLabelText></FormControlLabel>
                            <Input>
                                <InputField value={newName} onChangeText={setNewName} />
                            </Input>
                        </FormControl>
                        <Button onPress={handleSaveUser} size="lg" mb="$2" isDisabled={isSubmitting}>
                            <ButtonText>{isSubmitting ? 'Guardando...' : 'Guardar'}</ButtonText>
                        </Button>
                        <Button onPress={() => { setUserModalVisible(false); setEditingId(null); setNewName(''); }} variant="link" size="sm">
                            <ButtonText>Cancelar</ButtonText>
                        </Button>
                    </Box>
                </Box>
            </Modal>

            {/* Manual PIN modal */}
            <Modal visible={manualPinUserId !== null} animationType="fade" transparent>
                <Box flex={1} justifyContent="center" alignItems="center" bg="rgba(0,0,0,0.5)">
                    <Box bg="$white" p="$6" borderRadius="$2xl" w="80%">
                        <Heading size="md" mb="$4">PIN Manual</Heading>
                        <FormControl mb="$2">
                            <FormControlLabel><FormControlLabelText>4 caracteres (letras o números)</FormControlLabelText></FormControlLabel>
                            <Input size="xl">
                                <InputField
                                    value={manualPinInput}
                                    onChangeText={t => { setManualPinInput(t.toUpperCase()); setManualPinError(''); }}
                                    maxLength={4}
                                    autoCapitalize="characters"
                                    textAlign="center"
                                    placeholder="· · · ·"
                                />
                            </Input>
                        </FormControl>
                        {manualPinError ? <Text size="sm" color="$red500" mb="$3">{manualPinError}</Text> : <Box mb="$3" />}
                        <Button
                            size="lg"
                            mb="$2"
                            isDisabled={manualPinInput.length !== 4 || isSubmitting}
                            onPress={handleSaveManualPin}
                        >
                            <ButtonText>{isSubmitting ? 'Guardando...' : 'Guardar PIN'}</ButtonText>
                        </Button>
                        <Button variant="link" onPress={() => setManualPinUserId(null)}>
                            <ButtonText color="$coolGray400">Cancelar</ButtonText>
                        </Button>
                    </Box>
                </Box>
            </Modal>
        </Box>
    );
}
