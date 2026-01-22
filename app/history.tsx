import { Stack, useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import { getTransactions, TransactionDetail, deleteAllTransactions } from '@/db/queries';
import { useFocusEffect } from 'expo-router';
import * as XLSX from 'xlsx';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
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
    Icon,
    CloseIcon,
    DownloadIcon,
    TrashIcon,
    ButtonIcon,
    Modal,
    ModalBackdrop,
    ModalContent,
    ModalHeader,
    ModalCloseButton,
    ModalBody,
    ModalFooter,
    Input,
    InputField,
    Toast,
    ToastTitle,
    useToast
} from '@gluestack-ui/themed';

export default function HistoryScreen() {
    const [transactions, setTransactions] = useState<TransactionDetail[]>([]);
    const [showClearModal, setShowClearModal] = useState(false);
    const [pin, setPin] = useState('');
    const router = useRouter();
    const toast = useToast();

    useFocusEffect(
        useCallback(() => {
            loadHistory();
        }, [])
    );

    const loadHistory = async () => {
        const data = await getTransactions();
        setTransactions(data);
    };

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleString();
    };

    const handleExport = async () => {
        try {
            if (transactions.length === 0) {
                alert('No hay ventas para exportar');
                return;
            }

            const data = transactions.map(t => ({
                ID: t.id,
                Fecha: formatDate(t.created_at),
                Cliente: t.user_name,
                Total: t.total,
                Productos: t.items.map(i => `${i.product_name} (${i.quantity})`).join(', ')
            }));

            const dates = transactions
                .map(t => t.created_at ? new Date(t.created_at).getTime() : 0)
                .filter(d => d > 0);

            let filename = 'informe-ventas.xlsx';
            if (dates.length > 0) {
                const minDate = new Date(Math.min(...dates));
                const maxDate = new Date(Math.max(...dates));

                const fmt = (d: Date) => `${d.getDate().toString().padStart(2, '0')}_${(d.getMonth() + 1).toString().padStart(2, '0')}_${d.getFullYear()}`;
                filename = `informe-${fmt(minDate)}-${fmt(maxDate)}.xlsx`;
            }

            const ws = XLSX.utils.json_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Ventas");
            const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

            const file = new File(Paths.document, filename);
            file.create();
            file.write(wbout, { encoding: 'base64' });

            const uri = file.uri;

            await Sharing.shareAsync(uri, {
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                dialogTitle: 'Exportar Ventas'
            });
        } catch (error) {
            alert('Error al exportar: ' + (error instanceof Error ? error.message : 'Desconocido'));
        }
    };

    const handleClearHistory = () => {
        setPin('');
        setShowClearModal(true);
    };

    const confirmClear = async () => {
        if (pin === '1234') {
            const result = await deleteAllTransactions();
            if (result.success) {
                toast.show({
                    placement: "top",
                    render: ({ id }) => (
                        <Toast nativeID={'toast-' + id} action="success" variant="solid">
                            <ToastTitle>Historial Eliminado</ToastTitle>
                        </Toast>
                    )
                });
                setShowClearModal(false);
                loadHistory();
            } else {
                toast.show({
                    placement: "top",
                    render: ({ id }) => (
                        <Toast nativeID={'toast-' + id} action="error" variant="solid">
                            <ToastTitle>Error: {result.error}</ToastTitle>
                        </Toast>
                    )
                });
            }
        } else {
            toast.show({
                placement: "top",
                render: ({ id }) => (
                    <Toast nativeID={'toast-' + id} action="error" variant="solid">
                        <ToastTitle>PIN Incorrecto</ToastTitle>
                    </Toast>
                )
            });
        }
    };

    return (
        <Box flex={1} bg="$coolGray50">
            <Stack.Screen options={{ headerShown: false }} />

            <Box bg="$white" p="$4" borderBottomWidth={1} borderColor="$coolGray200">
                <VStack space="md" pt="$8" pb="$2">
                    <Heading textAlign="center" size="md">Historial de Ventas</Heading>
                    <HStack justifyContent="flex-end" space="md">
                        <Button onPress={handleClearHistory} size="sm" variant="outline" action="negative" borderColor="$red500">
                            <ButtonIcon as={TrashIcon} mr="$2" color="$red500" />
                            <ButtonText color="$red500">Limpiar</ButtonText>
                        </Button>
                        <Button onPress={handleExport} size="sm" variant="solid" action="positive" bg="$green600">
                            <ButtonIcon as={DownloadIcon} mr="$2" />
                            <ButtonText>Excel</ButtonText>
                        </Button>
                        <Button onPress={() => router.back()} size="sm" variant="link">
                            <ButtonText>Cerrar</ButtonText>
                            <ButtonIcon as={CloseIcon} ml="$2" />
                        </Button>
                    </HStack>
                </VStack>
            </Box>

            <ScrollView contentContainerStyle={{ padding: 16 }}>
                <VStack space="md">
                    {transactions.map(item => (
                        <Card key={item.id} variant="elevated" p="$4">
                            <HStack justifyContent="space-between" mb="$2">
                                <Heading size="sm">{item.user_name || 'Cliente desconocido'}</Heading>
                                <Text color="$green600" fontWeight="bold">₡{item.total.toFixed(2)}</Text>
                            </HStack>

                            <Box borderTopWidth={1} borderColor="$coolGray100" py="$2" my="$1">
                                {item.items.map((prod, index) => (
                                    <Text key={index} size="sm" color="$coolGray600">
                                        {prod.product_name} x{prod.quantity} - ₡{(prod.price * prod.quantity).toFixed(2)}
                                    </Text>
                                ))}
                            </Box>

                            <HStack justifyContent="space-between" mt="$2">
                                <Text size="xs" color="$coolGray400">{formatDate(item.created_at)}</Text>
                                <Text size="xs" color="$coolGray400">ID: #{item.id}</Text>
                            </HStack>
                        </Card>
                    ))}
                    {transactions.length === 0 && (
                        <Box alignItems="center" mt="$10">
                            <Text color="$coolGray400">No hay ventas registradas</Text>
                        </Box>
                    )}
                </VStack>
            </ScrollView>
            {/* PIN Confirmation Modal */}
            <Modal
                isOpen={showClearModal}
                onClose={() => setShowClearModal(false)}
            >
                <ModalBackdrop />
                <ModalContent>
                    <ModalHeader>
                        <Heading size="lg">Borrar Historial</Heading>
                        <ModalCloseButton>
                            <Icon as={CloseIcon} />
                        </ModalCloseButton>
                    </ModalHeader>
                    <ModalBody>
                        <Text size="sm" mb="$4" color="$coolGray500">
                            Esta acción eliminará todas las ventas registradas. Asegúrese de haber exportado el informe previamente.
                        </Text>
                        <Text size="sm" fontWeight="bold" mb="$2">Ingrese PIN de administrador:</Text>
                        <Input>
                            <InputField
                                type="password"
                                keyboardType="numeric"
                                maxLength={4}
                                value={pin}
                                onChangeText={setPin}
                                placeholder="****"
                            />
                        </Input>
                    </ModalBody>
                    <ModalFooter>
                        <Button
                            variant="outline"
                            size="sm"
                            action="secondary"
                            mr="$3"
                            onPress={() => setShowClearModal(false)}
                        >
                            <ButtonText>Cancelar</ButtonText>
                        </Button>
                        <Button
                            size="sm"
                            action="negative"
                            borderWidth="$0"
                            onPress={confirmClear}
                            bg="$red500"
                        >
                            <ButtonText>Confirmar Borrado</ButtonText>
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </Box>
    );
}
