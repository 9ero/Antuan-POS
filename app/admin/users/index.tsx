import { View, Text, FlatList, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { useState, useEffect } from 'react';
import { User, getUsers, addUser, deleteUser } from '../../../db/queries';
import { Ionicons } from '@expo/vector-icons';

export default function UsersAdmin() {
    const [users, setUsers] = useState<User[]>([]);
    const [modalVisible, setModalVisible] = useState(false);
    const [newName, setNewName] = useState('');

    const loadUsers = async () => {
        const data = await getUsers();
        setUsers(data);
    };

    useEffect(() => {
        loadUsers();
    }, []);

    const handleAdd = async () => {
        if (!newName) {
            Alert.alert('Error', 'El nombre es requerido');
            return;
        }
        await addUser(newName);
        setModalVisible(false);
        setNewName('');
        loadUsers();
    };

    const handleDelete = async (id: number) => {
        Alert.alert('Confirmar', '¿Eliminar usuario?', [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Eliminar', style: 'destructive', onPress: async () => {
                    await deleteUser(id);
                    loadUsers();
                }
            }
        ]);
    };

    return (
        <View className="flex-1 bg-gray-50">
            <Stack.Screen options={{ title: 'Gestionar Usuarios', headerShown: true }} />

            <FlatList
                data={users}
                keyExtractor={(item) => item.id.toString()}
                contentContainerStyle={{ padding: 16 }}
                renderItem={({ item }) => (
                    <View className="bg-white p-4 rounded-lg mb-3 shadow-sm flex-row justify-between items-center">
                        <Text className="font-bold text-lg">{item.name}</Text>
                        <TouchableOpacity onPress={() => handleDelete(item.id)}>
                            <Ionicons name="trash-outline" size={24} color="red" />
                        </TouchableOpacity>
                    </View>
                )}
            />

            <TouchableOpacity
                className="absolute bottom-8 right-8 bg-blue-600 w-14 h-14 rounded-full justify-center items-center shadow-lg"
                onPress={() => setModalVisible(true)}
            >
                <Ionicons name="add" size={30} color="white" />
            </TouchableOpacity>

            <Modal visible={modalVisible} animationType="slide" transparent>
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-white rounded-t-3xl p-6">
                        <Text className="text-xl font-bold mb-4">Nuevo Usuario</Text>

                        <TextInput
                            placeholder="Nombre del usuario"
                            className="border-b border-gray-300 p-3 mb-8 text-lg"
                            value={newName}
                            onChangeText={setNewName}
                        />

                        <TouchableOpacity className="bg-blue-600 p-4 rounded-xl mb-3" onPress={handleAdd}>
                            <Text className="text-white text-center font-bold text-lg">Guardar</Text>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => setModalVisible(false)}>
                            <Text className="text-blue-600 text-center p-2">Cancelar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}
