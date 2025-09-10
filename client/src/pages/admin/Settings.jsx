import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  VStack,
  Heading,
  Text,
  Card,
  CardBody,
  FormControl,
  FormLabel,
  Input,
  Button,
  useToast,
  SimpleGrid,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  HStack,
  IconButton,
  Divider,
  Image,
} from '@chakra-ui/react';
import { FaPercent, FaMoneyBill, FaPlus, FaTrash } from 'react-icons/fa';
import api from '../../services/api';
import AdminLayout from '../../components/AdminLayout';
import { useAuth } from '../../contexts/AuthContext';

const defaultPackages = {
  package1: { amount: 100, duration: 12, income: 20 },
  package2: { amount: 500, duration: 20, income: 50 },
  package3: { amount: 1000, duration: 30, income: 200 }, // 200% profit = ₱2000, total return ₱3000
  package4: { amount: 1000, duration: 40, income: 400 } // 400% profit = ₱4000, total return ₱5000
};

const defaultPaymentMethods = ['GCash', 'GoTyme Bank'];

const normalizePaymentMethods = (methods) => {
  if (!methods) return [];
  return methods.map(m =>
    typeof m === 'string'
      ? { name: m, accountName: 'Default Account', accountNumber: '0000000000', qr: '', details: '' }
      : m
  );
};

export default function Settings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState({
    clickReward: 1,
    referralBonus: 50,
    minimumWithdrawal: 500,
    sharedEarningPercentage: 0.5,
    packages: defaultPackages,
    paymentMethods: defaultPaymentMethods
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await api.get('/admin/settings');
      const fetchedSettings = response.data;
      setSettings({
        ...fetchedSettings,
        packages: fetchedSettings.packages || defaultPackages,
        paymentMethods: normalizePaymentMethods(fetchedSettings.paymentMethods || defaultPaymentMethods)
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch settings',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      await api.put('/admin/settings', settings);
      
      toast({
        title: 'Success',
        description: 'Settings updated successfully',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to update settings',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: parseFloat(value) || 0
    }));
  };

  const handlePackageChange = (packageId, field, value) => {
    setSettings(prev => ({
      ...prev,
      packages: {
        ...prev.packages,
        [packageId]: {
          ...prev.packages[packageId],
          [field]: parseFloat(value) || 0
        }
      }
    }));
  };

  const handlePaymentMethodChange = (idx, field, value) => {
    setSettings(prev => {
      const updated = [...prev.paymentMethods];
      updated[idx][field] = value;
      return { ...prev, paymentMethods: updated };
    });
  };

  const handlePaymentMethodImage = (idx, file) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      setSettings(prev => {
        const updated = [...prev.paymentMethods];
        updated[idx].qr = reader.result;
        return { ...prev, paymentMethods: updated };
      });
    };
    if (file) reader.readAsDataURL(file);
  };

  if (loading) {
    return (
      <AdminLayout>
        <Container maxW="container.xl" py={8}>
          <Text color="hsl(220, 14%, 90%)">Loading settings...</Text>
        </Container>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <Container maxW="container.xl" py={8}>
    <VStack spacing={8} align="stretch">
          <VStack align="start" spacing={1}>
            <Heading size="lg" color="white">
              System Settings
            </Heading>
            <Text color="hsl(220, 14%, 70%)">
              Configure system-wide settings and parameters
            </Text>
          </VStack>

          <Card bg="#242C2E" borderColor="#181E20" borderWidth="1px" boxShadow="dark-lg">
            <CardBody>
              <form onSubmit={handleSubmit}>
                <VStack spacing={8} align="stretch">
                {/* Basic Settings */}
                <Box>
                  <Heading size="md" mb={4} color="hsl(220, 14%, 90%)">
                    Basic Settings
                  </Heading>
                  <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={6}>
                    <FormControl>
                      <FormLabel color="hsl(220, 14%, 90%)">Click Reward</FormLabel>
                      <InputGroup>
                        <InputLeftElement pointerEvents="none">
                          <FaMoneyBill color="#FDB137" />
                        </InputLeftElement>
                        <Input
                          type="number"
                          name="clickReward"
                          placeholder="Enter click reward"
                          value={settings.clickReward}
                          onChange={handleChange}
                          bg="#242C2E"
                          borderColor="#181E20"
                          color="hsl(220, 14%, 90%)"
                          _hover={{ borderColor: '#FDB137' }}
                          _focus={{ borderColor: '#FDB137', boxShadow: '0 0 0 1px #FDB137' }}
                        />
                        <InputRightElement pointerEvents="none" color="#FDB137">
                          ₱
                        </InputRightElement>
                      </InputGroup>
            </FormControl>
                    <FormControl>
                      <FormLabel color="hsl(220, 14%, 90%)">Referral Bonus</FormLabel>
                      <InputGroup>
                        <InputLeftElement pointerEvents="none">
                          <FaPercent color="#FDB137" />
                        </InputLeftElement>
                        <Input
                          type="number"
                          name="referralBonus"
                          placeholder="Enter referral bonus"
                          value={settings.referralBonus}
                          onChange={handleChange}
                          bg="#242C2E"
                          borderColor="#181E20"
                          color="hsl(220, 14%, 90%)"
                          _hover={{ borderColor: '#FDB137' }}
                          _focus={{ borderColor: '#FDB137', boxShadow: '0 0 0 1px #FDB137' }}
                        />
                        <InputRightElement pointerEvents="none" color="#FDB137">
                          %
                        </InputRightElement>
                      </InputGroup>
            </FormControl>
                    <FormControl>
                      <FormLabel color="hsl(220, 14%, 90%)">Minimum Withdrawal</FormLabel>
                      <InputGroup>
                        <InputLeftElement pointerEvents="none">
                          <FaMoneyBill color="#FDB137" />
                        </InputLeftElement>
                        <Input
                          type="number"
                          name="minimumWithdrawal"
                          placeholder="Enter minimum withdrawal"
                          value={settings.minimumWithdrawal}
                          onChange={handleChange}
                          bg="#242C2E"
                          borderColor="#181E20"
                          color="hsl(220, 14%, 90%)"
                          _hover={{ borderColor: '#FDB137' }}
                          _focus={{ borderColor: '#FDB137', boxShadow: '0 0 0 1px #FDB137' }}
                        />
                        <InputRightElement pointerEvents="none" color="#FDB137">
                          ₱
                        </InputRightElement>
                      </InputGroup>
            </FormControl>
                    <FormControl>
                      <FormLabel color="hsl(220, 14%, 90%)">Shared Earning Percentage</FormLabel>
                      <InputGroup>
                        <InputLeftElement pointerEvents="none">
                          <FaPercent color="#FDB137" />
                        </InputLeftElement>
                        <Input
                          type="number"
                          name="sharedEarningPercentage"
                          placeholder="Enter shared earning percentage"
                          value={settings.sharedEarningPercentage}
                          onChange={handleChange}
                          bg="#242C2E"
                          borderColor="#181E20"
                          color="hsl(220, 14%, 90%)"
                          _hover={{ borderColor: '#FDB137' }}
                          _focus={{ borderColor: '#FDB137', boxShadow: '0 0 0 1px #FDB137' }}
                        />
                        <InputRightElement pointerEvents="none" color="#FDB137">
                          %
                        </InputRightElement>
                      </InputGroup>
            </FormControl>
                  </SimpleGrid>
                </Box>
                <Divider borderColor="#181E20" />
                {/* Package Settings */}
                <Box>
                  <Heading size="md" mb={4} color="hsl(220, 14%, 90%)">
                    Package Settings
                  </Heading>
                  <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={6}>
                    {Object.entries(settings.packages || defaultPackages).map(([packageId, pkg]) => (
                      <Box key={packageId} bg="#242C2E" borderColor="#181E20" borderWidth="1px" borderRadius="md" p={4}>
                        <VStack spacing={4} align="stretch">
                          <Heading size="sm" color="hsl(220, 14%, 90%)">
                            {packageId.charAt(0).toUpperCase() + packageId.slice(1)}
                          </Heading>
                          <FormControl>
                            <FormLabel color="hsl(220, 14%, 90%)" fontSize="sm">Amount</FormLabel>
                            <InputGroup>
                              <InputLeftElement pointerEvents="none">
                                <FaMoneyBill color="#FDB137" />
                              </InputLeftElement>
                              <Input
                                type="number"
                                value={pkg.amount}
                                onChange={(e) => handlePackageChange(packageId, 'amount', e.target.value)}
                                bg="#242C2E"
                                borderColor="#181E20"
                                color="hsl(220, 14%, 90%)"
                                _hover={{ borderColor: '#FDB137' }}
                                _focus={{ borderColor: '#FDB137', boxShadow: '0 0 0 1px #FDB137' }}
                                size="sm"
                              />
                            </InputGroup>
                          </FormControl>
                          <FormControl>
                            <FormLabel color="hsl(220, 14%, 90%)" fontSize="sm">Duration (days)</FormLabel>
                            <Input
                              type="number"
                              value={pkg.duration}
                              onChange={(e) => handlePackageChange(packageId, 'duration', e.target.value)}
                              bg="#242C2E"
                              borderColor="#181E20"
                              color="hsl(220, 14%, 90%)"
                              _hover={{ borderColor: '#FDB137' }}
                              _focus={{ borderColor: '#FDB137', boxShadow: '0 0 0 1px #FDB137' }}
                              size="sm"
                            />
                          </FormControl>
                          <FormControl>
                            <FormLabel color="hsl(220, 14%, 90%)" fontSize="sm">Income (%)</FormLabel>
                            <InputGroup>
                              <InputLeftElement pointerEvents="none">
                                <FaPercent color="#FDB137" />
                              </InputLeftElement>
                              <Input
                                type="number"
                                value={pkg.income}
                                onChange={(e) => handlePackageChange(packageId, 'income', e.target.value)}
                                bg="#242C2E"
                                borderColor="#181E20"
                                color="hsl(220, 14%, 90%)"
                                _hover={{ borderColor: '#FDB137' }}
                                _focus={{ borderColor: '#FDB137', boxShadow: '0 0 0 1px #FDB137' }}
                                size="sm"
                              />
                            </InputGroup>
                          </FormControl>
                        </VStack>
                      </Box>
                    ))}
                  </SimpleGrid>
                </Box>
                <Divider borderColor="#181E20" />
                {/* Payment Methods */}
                <Box>
                  <Heading size="md" mb={4} color="hsl(220, 14%, 90%)">
                    Payment Methods
                  </Heading>
                  <VStack spacing={4} align="stretch">
                    <Button onClick={() => setSettings(prev => ({
                      ...prev,
                      paymentMethods: [...prev.paymentMethods, { 
                        name: 'New Method',
                        accountName: 'Default Account',
                        accountNumber: '0000000000',
                        qr: '',
                        details: ''
                      }]
                    }))} leftIcon={<FaPlus />} bg="#FDB137" color="#181E20" _hover={{ bg: '#BD5301', color: 'white' }} _active={{ bg: '#FDB137', color: '#181E20' }} alignSelf="flex-start">
                      Add Payment Method
                    </Button>
                    <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
                      {(settings.paymentMethods || []).map((method, idx) => (
                        <Box key={idx} p={4} bg="#242C2E" borderRadius="md" borderWidth="1px" borderColor="#181E20">
                          <VStack spacing={3} align="stretch">
                            <HStack justify="space-between">
                              <Heading size="sm" color="hsl(220, 14%, 90%)">{method.name || 'New Method'}</Heading>
                              <IconButton
                                icon={<FaTrash />}
                                size="sm"
                                bg="transparent"
                                color="#FDB137"
                                _hover={{ bg: '#BD5301', color: 'white' }}
                                onClick={() => setSettings(prev => ({
                                  ...prev,
                                  paymentMethods: prev.paymentMethods.filter((_, i) => i !== idx)
                                }))}
                                aria-label="Remove payment method"
                              />
                            </HStack>
                            <FormControl>
                              <FormLabel color="hsl(220, 14%, 90%)">Name</FormLabel>
                              <Input
                                value={method.name}
                                onChange={e => handlePaymentMethodChange(idx, 'name', e.target.value)}
                                bg="#242C2E"
                                borderColor="#181E20"
                                color="white"
                                _hover={{ borderColor: '#FDB137' }}
                                _focus={{ borderColor: '#FDB137', boxShadow: '0 0 0 1px #FDB137' }}
                              />
                            </FormControl>
                            <FormControl>
                              <FormLabel color="hsl(220, 14%, 90%)">Account Name</FormLabel>
                              <Input
                                value={method.accountName}
                                onChange={e => handlePaymentMethodChange(idx, 'accountName', e.target.value)}
                                bg="#242C2E"
                                borderColor="#181E20"
                                color="white"
                                _hover={{ borderColor: '#FDB137' }}
                                _focus={{ borderColor: '#FDB137', boxShadow: '0 0 0 1px #FDB137' }}
                              />
                            </FormControl>
                            <FormControl>
                              <FormLabel color="hsl(220, 14%, 90%)">Account Number</FormLabel>
                              <Input
                                value={method.accountNumber}
                                onChange={e => handlePaymentMethodChange(idx, 'accountNumber', e.target.value)}
                                bg="#242C2E"
                                borderColor="#181E20"
                                color="white"
                                _hover={{ borderColor: '#FDB137' }}
                                _focus={{ borderColor: '#FDB137', boxShadow: '0 0 0 1px #FDB137' }}
                              />
                            </FormControl>
                            <FormControl>
                              <FormLabel color="hsl(220, 14%, 90%)">QR Code / Image</FormLabel>
                              <Input
                                type="file"
                                accept="image/*"
                                onChange={e => handlePaymentMethodImage(idx, e.target.files[0])}
                                bg="#242C2E"
                                borderColor="#181E20"
                                color="white"
                                _hover={{ borderColor: '#FDB137' }}
                                _focus={{ borderColor: '#FDB137', boxShadow: '0 0 0 1px #FDB137' }}
                              />
                              {method.qr && (
                                <Box mt={2} textAlign="center">
                                  <Image src={method.qr} alt="QR Code" maxH={120} borderRadius={8} />
                                </Box>
                              )}
                            </FormControl>
                            <FormControl>
                              <FormLabel color="hsl(220, 14%, 90%)">Extra Details</FormLabel>
                              <Input
                                value={method.details}
                                onChange={e => handlePaymentMethodChange(idx, 'details', e.target.value)}
                                bg="#242C2E"
                                borderColor="#181E20"
                                color="white"
                                _hover={{ borderColor: '#FDB137' }}
                                _focus={{ borderColor: '#FDB137', boxShadow: '0 0 0 1px #FDB137' }}
                              />
                            </FormControl>
                          </VStack>
                        </Box>
                      ))}
                    </SimpleGrid>
                  </VStack>
                </Box>
            <Button
                    type="submit"
                  bg="#FDB137"
                  color="#181E20"
                    size="lg"
                    isLoading={saving}
                    loadingText="Saving..."
                    _hover={{
                      bg: '#BD5301',
                      color: 'white',
                      transform: 'translateY(-2px)',
                      boxShadow: 'lg'
                    }}
                    _active={{
                      bg: '#FDB137',
                      color: '#181E20',
                      transform: 'translateY(0)'
                    }}
            >
              Save Settings
            </Button>
                </VStack>
              </form>
            </CardBody>
          </Card>
    </VStack>
      </Container>
    </AdminLayout>
  );
}