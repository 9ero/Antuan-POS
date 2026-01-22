import { Modal, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { useState, useCallback } from 'react';
import { User, getUsers, addUser, deleteUser, updateUser } from '../../../db/queries';
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
} from '@gluestack-ui/themed';

export default function UsersAdmin() {
    const [users, setUsers] = useState<User[]>([]);
    const [modalVisible, setModalVisible] = useState(false);
    const [newName, setNewName] = useState('');

    const [editingId, setEditingId] = useState<number | null>(null);

    const loadUsers = async () => {
        const data = await getUsers();
        setUsers(data);
    };

    useFocusEffect(
        useCallback(() => {
            loadUsers();
        }, [])
    );

    const handleAdd = async () => {
        if (!newName) {
            alert('El nombre es requerido');
            return;
        }

        if (editingId) {
            await updateUser(editingId, newName);
        } else {
            await addUser(newName);
        }

        setModalVisible(false);
        setNewName('');
        setEditingId(null);
        loadUsers();
    };

    const handleEdit = (user: User) => {
        setNewName(user.name);
        setEditingId(user.id!);
        setModalVisible(true);
    };

    const handleDelete = async (id: number) => {
        await deleteUser(id);
        loadUsers();
    };

    return (
        <Box flex={1} bg="$coolGray50">
            <Stack.Screen options={{ title: 'Gestionar Usuarios', headerShown: true }} />

            <ScrollView contentContainerStyle={{ padding: 16 }}>
                <VStack space="md">
                    {users.map(item => (
                        <Card key={item.id} variant="elevated" p="$4">
                            <HStack justifyContent="space-between" alignItems="center">
                                <Heading size="sm">{item.name}</Heading>
                                <HStack space="md">
                                    <Pressable onPress={() => handleEdit(item)}>
                                        <Icon as={EditIcon} color="$blue600" size="xl" />
                                    </Pressable>
                                    <Pressable onPress={() => handleDelete(item.id!)}>
                                        <Icon as={TrashIcon} color="$red600" size="xl" />
                                    </Pressable>
                                </HStack>
                            </HStack>
                        </Card>
                    ))}
                </VStack>
            </ScrollView>

            <Fab
                size="lg"
                placement="bottom right"
                isHovered={false}
                isDisabled={false}
                isPressed={false}
                onPress={() => { setEditingId(null); setNewName(''); setModalVisible(true); }}
                bg="$blue600"
            >
                <FabIcon as={AddIcon} />
            </Fab>

            <Modal visible={modalVisible} animationType="slide" transparent>
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

                        <Button onPress={handleAdd} size="lg" mb="$2">
                            <ButtonText>Guardar</ButtonText>
                        </Button>
                        <Button onPress={() => { setModalVisible(false); setEditingId(null); setNewName(''); }} variant="link" size="sm">
                            <ButtonText>Cancelar</ButtonText>
                        </Button>
                    </Box>
                </Box>
            </Modal>
        </Box>
    );
}
