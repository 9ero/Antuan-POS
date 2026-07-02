import { Modal, KeyboardAvoidingView } from 'react-native';
import { Stack } from 'expo-router';
import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import {
    Category, getAllCategories, addCategory, updateCategory, setCategoryActive,
} from '@/db/queries';
import { getDeviceConfig, pushCategoryToTurso } from '@/db/sync';
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
    Icon,
    EditIcon,
    FormControl,
    FormControlLabel,
    FormControlLabelText,
} from '@gluestack-ui/themed';

export default function CategoriesAdmin() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [modalVisible, setModalVisible] = useState(false);
    const [name, setName] = useState('');
    const [editingId, setEditingId] = useState<number | null>(null);
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const loadAll = async () => {
        setCategories(await getAllCategories());
    };

    useFocusEffect(useCallback(() => { loadAll(); }, []));

    // Sube la categoría a Turso al instante (fire-and-forget, cola offline si no hay red)
    const syncCategory = (id: number) => {
        getDeviceConfig().then(cfg => { if (cfg) pushCategoryToTurso(cfg.deviceId, id).catch(() => {}); });
    };

    const openAdd = () => {
        setName('');
        setEditingId(null);
        setError('');
        setModalVisible(true);
    };

    const openEdit = (cat: Category) => {
        setName(cat.name);
        setEditingId(cat.id!);
        setError('');
        setModalVisible(true);
    };

    const handleSave = async () => {
        const clean = name.trim();
        if (!clean) { setError('El nombre es requerido'); return; }
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            const savedId = editingId
                ? await updateCategory(editingId, clean)
                : await addCategory(clean);
            setModalVisible(false);
            syncCategory(savedId);
            loadAll();
        } catch {
            setError('Ya existe una categoría con ese nombre');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleToggle = async (cat: Category) => {
        await setCategoryActive(cat.id!, cat.is_active === 0);
        syncCategory(cat.id!);
        loadAll();
    };

    return (
        <Box flex={1} bg="$coolGray50">
            <Stack.Screen options={{ title: 'Categorías', headerShown: true }} />

            <ScrollView contentContainerStyle={{ padding: 16 }}>
                <Text size="sm" color="$coolGray500" mb="$3">
                    Las categorías desactivadas no aparecen al crear productos ni como filtro en el POS,
                    pero los productos ya asignados las conservan.
                </Text>

                <VStack space="sm">
                    {categories.length === 0 && (
                        <Box alignItems="center" py="$8">
                            <Text color="$coolGray400">No hay categorías. Creá una con el botón +</Text>
                        </Box>
                    )}

                    {categories.map(cat => {
                        const active = cat.is_active !== 0;
                        return (
                            <Card key={cat.id} variant="elevated" p="$4">
                                <HStack justifyContent="space-between" alignItems="center">
                                    <VStack flex={1}>
                                        <Text fontWeight="$bold" color={active ? '$coolGray800' : '$coolGray400'}>
                                            {cat.name}
                                        </Text>
                                        <Text size="xs" color={active ? '$emerald600' : '$coolGray400'}>
                                            {active ? 'Activa' : 'Desactivada'}
                                        </Text>
                                    </VStack>
                                    <HStack space="md" alignItems="center">
                                        <Button
                                            size="xs"
                                            variant="outline"
                                            action={active ? 'secondary' : 'positive'}
                                            onPress={() => handleToggle(cat)}
                                        >
                                            <ButtonText>{active ? 'Desactivar' : 'Activar'}</ButtonText>
                                        </Button>
                                        <Pressable onPress={() => openEdit(cat)}>
                                            <Icon as={EditIcon} color="$blue600" size="lg" />
                                        </Pressable>
                                    </HStack>
                                </HStack>
                            </Card>
                        );
                    })}
                </VStack>
            </ScrollView>

            <Fab size="lg" placement="bottom right" onPress={openAdd} bg="$blue600">
                <FabIcon as={AddIcon} />
            </Fab>

            <Modal visible={modalVisible} animationType="slide" transparent>
                <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
                    <Box bg="$white" borderTopLeftRadius="$2xl" borderTopRightRadius="$2xl" p="$6">
                        <Heading size="lg" mb="$4">{editingId ? 'Editar categoría' : 'Nueva categoría'}</Heading>
                        <FormControl mb="$4">
                            <FormControlLabel><FormControlLabelText>Nombre</FormControlLabelText></FormControlLabel>
                            <Input>
                                <InputField
                                    value={name}
                                    onChangeText={t => { setName(t); setError(''); }}
                                    placeholder="Ej: Bebidas, Snacks…"
                                    autoFocus
                                />
                            </Input>
                            {error ? <Text size="sm" color="$red500" mt="$2">{error}</Text> : null}
                        </FormControl>
                        <Button onPress={handleSave} size="lg" mb="$2" isDisabled={isSubmitting} bg="$blue600">
                            <ButtonText>{isSubmitting ? 'Guardando...' : 'Guardar'}</ButtonText>
                        </Button>
                        <Button onPress={() => setModalVisible(false)} variant="link" size="sm">
                            <ButtonText>Cancelar</ButtonText>
                        </Button>
                    </Box>
                </KeyboardAvoidingView>
            </Modal>
        </Box>
    );
}
