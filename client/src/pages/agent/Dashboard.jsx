import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardBody,
  SimpleGrid,
  VStack,
  Text,
  Heading,
  Badge,
  Container,
  Button,
  Input,
  useToast,
  Icon,
  Flex,
  Image,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
  RadioGroup,
  Radio,
  Stack
} from '@chakra-ui/react';
import { FaWallet, FaUsers, FaChartLine, FaGift, FaExchangeAlt } from 'react-icons/fa';
import AgentLayout from '../../components/AgentLayout';
import axios from 'axios';
import ClickingTask from '../../components/ClickingTask';

const StatCard = ({ title, stat, icon, subtext }) => {
  return (
    <Card bg="#1E2528" borderWidth="1px" borderColor="gray.700" height="100%">
      <CardBody>
        <VStack align="start" spacing={2} height="100%">
          <Flex justify="space-between" align="center" width="100%">
            <Text color="gray.400" noOfLines={1}>{title}</Text>
            {icon && (
              <Box
                p={2}
                bg="#FDB137"
                borderRadius="full"
                color="black"
                transition="all 0.2s"
                _hover={{ 
                  transform: 'scale(0.95)',
                  bg: '#BD5301',
                  color: 'white'
                }}
                display="flex"
                alignItems="center"
                justifyContent="center"
                width="32px"
                height="32px"
                flexShrink={0}
              >
                <Icon as={icon} w={5} h={5} color="currentColor" />
              </Box>
            )}
          </Flex>
          <Heading size="lg" color="white" noOfLines={1}>{stat}</Heading>
          {subtext && (
            <Text color="#FDB137" fontSize="sm" noOfLines={2}>
              {subtext}
            </Text>
          )}
        </VStack>
      </CardBody>
    </Card>
  );
};

const SharedCapitalPackage = ({ packageNumber, minimum, onEnter, walletBalance }) => {
  const [amount, setAmount] = useState('');
  const [isRequesting, setIsRequesting] = useState(false);
  const toast = useToast();

  const handlePackageRequest = async () => {
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) < minimum) {
      toast({
        title: 'Invalid Amount',
        description: `Please enter an amount greater than or equal to ₱${minimum}`,
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    if (parseFloat(amount) > walletBalance) {
      toast({
        title: 'Insufficient Balance',
        description: 'You do not have enough balance in your wallet',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    setIsRequesting(true);
    try {
      await onEnter(amount);
      toast({
        title: 'Package Activated',
        description: 'Your package has been successfully activated',
        status: 'success',
        duration: 5000,
        isClosable: true,
      });
      setAmount('');
    } catch (error) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to activate package',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setIsRequesting(false);
    }
  };

  const isInvalid = !amount || parseFloat(amount) < minimum || parseFloat(amount) > walletBalance;

  return (
    <Card 
      bg="#1E2528" 
      borderWidth="1px"
      borderColor="gray.700"
      overflow="hidden"
      transition="all 0.3s ease"
      _hover={{
        transform: 'translateY(-5px)',
        borderColor: '#FDB137',
        boxShadow: '0 10px 20px rgba(0,0,0,0.2)'
      }}
    >
      <CardBody p={0}>
        <Image src={`/package${packageNumber}.jpg`} alt={`Package ${packageNumber}`} objectFit="cover" />
        <Box p={4}>
          <VStack spacing={4}>
            <Input
              placeholder={`Enter amount (Min: ₱${minimum})`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              bg="#181E20"
              color="white"
              borderColor="gray.600"
              _hover={{ borderColor: '#FDB137' }}
              _focus={{ borderColor: '#FDB137', boxShadow: '0 0 0 1px #FDB137' }}
            />
            <Button
              bg="#FDB137"
              color="#181E20"
              width="full"
              fontWeight="bold"
              _hover={{ bg: '#BD5301', color: 'white' }}
              transition="all 0.2s"
              onClick={handlePackageRequest}
              isLoading={isRequesting}
              loadingText="Processing..."
              isDisabled={isInvalid || isRequesting}
            >
              AVAIL PACKAGE
            </Button>
          </VStack>
          </Box>
      </CardBody>
    </Card>
  );
};

export default function Dashboard() {
  const [stats, setStats] = useState({
    wallet: 0,
    directReferral: 0,
    indirectReferral: 0,
    totalClicks: 0,
    sharedEarnings: 0,
    pendingEarnings: 0,
    immaturePackages: 0,
    immatureAmount: 0
  });
  const [activePackages, setActivePackages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dailyClicks, setDailyClicks] = useState(0);
  const [dailyEarnings, setDailyEarnings] = useState(0);
  const [maxClicks, setMaxClicks] = useState(50);
  const [maxReward, setMaxReward] = useState(10);
  const [clickingTaskActivated, setClickingTaskActivated] = useState(false);
  const [selectedPackageForRollover, setSelectedPackageForRollover] = useState(null);
  const [selectedTargetPackage, setSelectedTargetPackage] = useState('');
  const [isRolloverLoading, setIsRolloverLoading] = useState(false);
  const { isOpen: isRolloverOpen, onOpen: onRolloverOpen, onClose: onRolloverClose } = useDisclosure();
  const toast = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    // always use 50 clicks and ₱10.00 per day
    setMaxClicks(50);
    setMaxReward(10);
    try {
      setIsLoading(true);
      const [statsRes, packagesRes, userRes] = await Promise.all([
        axios.get('/agent/earnings'),
        axios.get('/agent/packages/active'),
        axios.get('/auth/me')
      ]);
      setStats(statsRes.data);
      // Process packages from server
      const now = new Date();
      const packages = Array.isArray(packagesRes.data) ? packagesRes.data : [];
      
      console.log('Received packages from server:', packages);
      
      // Process each package to ensure all required fields are set
      const packagesWithDays = packages.map(pkg => {
        try {
          // Use server-calculated values if available
          if (pkg.daysRemaining !== undefined && pkg.totalDays !== undefined && pkg.isMatured !== undefined) {
            return {
              ...pkg,
              // Ensure these fields are numbers
              daysRemaining: Number(pkg.daysRemaining),
              totalDays: Number(pkg.totalDays),
              isMatured: Boolean(pkg.isMatured)
            };
          }
          
          // Fallback calculation if server didn't provide values
          const start = new Date(pkg.startDate);
          const end = new Date(pkg.endDate);
          
          if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            console.error('Invalid dates for package:', pkg._id, { 
              startDate: pkg.startDate, 
              endDate: pkg.endDate
            });
            return null;
          }
          
          const totalDays = pkg.packageType === 1 ? 12 : pkg.packageType === 2 ? 20 : 30;
          const daysRemaining = Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
          const isMatured = now >= end;
          
          return {
            ...pkg,
            daysRemaining,
            totalDays,
            isMatured
          };
          
        } catch (error) {
          console.error('Error processing package:', pkg._id, error);
          return null;
        }
      });
      setActivePackages(packagesWithDays);
      // Set daily clicks and earnings from user data
      const clicksValue = typeof userRes.data.dailyClicks === 'object'
        ? userRes.data.dailyClicks?.count || 0
        : userRes.data.dailyClicks || 0;
      setDailyClicks(clicksValue);
      setDailyEarnings(userRes.data.dailyClickEarnings || 0);
      setClickingTaskActivated(userRes.data.clickingTaskActivated || false);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch dashboard data',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
      setActivePackages([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClick = async () => {
    try {
      const response = await axios.post('/agent/click');
      
      // Update the daily clicks and earnings from the response
      setDailyClicks(response.data.clicks);
      setDailyEarnings(response.data.dailyEarnings);
      
      // Refresh the dashboard data to update the stats
      fetchData();
      
    } catch (error) {
      console.error('Error recording click:', error);
      
      // Show appropriate error message
      const errorMessage = error.response?.data?.message || 'Failed to record click';
      toast({
        title: 'Error',
        description: errorMessage,
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const handlePackageEnter = async (amount, packageNumber) => {
    try {
      const response = await axios.post('/agent/packages/activate', {
        amount: parseFloat(amount),
        packageId: packageNumber
      });
      
      // Update wallet balance and refresh dashboard data
      if (response.data.newBalance !== undefined) {
        setStats(prevStats => ({
          ...prevStats,
          wallet: response.data.newBalance
        }));
      }
      
      // Refresh all dashboard data to ensure everything is up to date
      fetchData();
      
      return response.data;
    } catch (error) {
      console.error('Error activating package:', error);
      throw error;
    }
  };

  const handleClaimPackage = async (packageId) => {
    try {
      const response = await axios.post('/agent/packages/claim', { packageId });
      
      toast({
        title: 'Package Claimed',
        description: `Successfully claimed package earnings!`,  // Updated to match the server response
        status: 'success',
        duration: 5000,
        isClosable: true,
      });
      
      // Refresh dashboard data to update stats and package list
      fetchData();
    } catch (error) {
      console.error('Error claiming package:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to claim package',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  const handleRolloverClick = (pkg) => {
    setSelectedPackageForRollover(pkg);
    setSelectedTargetPackage('');
    onRolloverOpen();
  };

  const handleRolloverConfirm = async () => {
    if (!selectedPackageForRollover || !selectedTargetPackage) {
      toast({
        title: 'Selection Required',
        description: 'Please select a target package for rollover',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    setIsRolloverLoading(true);
    try {
      const response = await axios.post('/agent/packages/rollover', {
        packageId: selectedPackageForRollover._id,
        targetPackageType: parseInt(selectedTargetPackage)
      });

      toast({
        title: 'Rollover Successful',
        description: `Successfully rolled over Package ${selectedPackageForRollover.packageType} to Package ${selectedTargetPackage}`,
        status: 'success',
        duration: 5000,
        isClosable: true,
      });

      onRolloverClose();
      setSelectedPackageForRollover(null);
      setSelectedTargetPackage('');
      
      // Refresh dashboard data to update stats and package list
      fetchData();
    } catch (error) {
      console.error('Error rolling over package:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to rollover package',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsRolloverLoading(false);
    }
  };

  const getAvailableRolloverOptions = (currentPackageType) => {
    const options = [];
    if (currentPackageType < 2) {
      options.push({ value: '2', label: 'Package 2 (20 days)', description: 'Higher returns, longer duration' });
    }
    if (currentPackageType < 3) {
      options.push({ value: '3', label: 'Package 3 (30 days)', description: 'Highest returns, longest duration' });
    }
    if (currentPackageType === 3) {
      options.push({ value: '3', label: 'Package 3 (30 days)', description: 'Reinvest in Package 3 for continued growth' });
    }
    return options;
  };

  return (
    <AgentLayout>
      <Container maxW="7xl">
        {/* Clicking Task Section */}
        <Box mb={8}>
          <ClickingTask
            onEarn={handleClick}
            dailyClicks={dailyClicks}
            dailyEarnings={dailyEarnings}
            maxClicks={maxClicks}
            maxReward={maxReward}
            isActivated={clickingTaskActivated}
            walletBalance={stats.wallet}
            onActivationSuccess={(data) => {
              setClickingTaskActivated(true);
              setStats(prevStats => ({
                ...prevStats,
                wallet: data.newBalance
              }));
              fetchData(); // Refresh all data
            }}
          />
        </Box>

        {/* Stats Grid */}
        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4} mb={8} templateColumns="repeat(auto-fill, minmax(250px, 1fr))">
          <StatCard
            title="Wallet"
            stat={`₱${stats.wallet.toLocaleString()}`}
            icon={FaWallet}
            subtext={stats.immaturePackages > 0 ? `₱${stats.immatureAmount.toLocaleString()} in ${stats.immaturePackages} immature package(s)` : null}
          />
          <StatCard
            title="Direct Referral Income"
            stat={`₱${stats.directReferral.toLocaleString()}`}
            icon={FaUsers}
          />
          <StatCard
            title="Indirect Referral Income"
            stat={`₱${stats.indirectReferral.toLocaleString()}`}
            icon={FaUsers}
          />
          <StatCard
            title="Total Clicks Earnings"
            stat={`₱${stats.totalClicks.toFixed(2)}`}
            icon={FaChartLine}
          />
          <StatCard
            title="Shared Capital Earnings"
            stat={`₱${stats.sharedEarnings.toLocaleString()}`}
            icon={FaWallet}
          />
          <StatCard
            title="Total Withdraw"
            stat={`₱${stats.totalWithdraw?.toLocaleString() || '0'}`}
            icon={FaWallet}
          />
        </SimpleGrid>

        {/* All Unclaimed Packages - Show both active and matured but unclaimed packages */}
        {activePackages.length > 0 && (
          <Box mb={8}>
            <Heading 
              as="h2" 
              fontSize="22px" 
              fontWeight="600" 
              color="white" 
              mb={4}
              fontFamily="'Montserrat', sans-serif"
            >
              My Packages
            </Heading>
            <SimpleGrid columns={{ base: 2, md: 3, lg: 4 }} spacing={4}>
              {/* Show all unclaimed packages, with matured ones first */}
              {activePackages
                .sort((a, b) => (a.isMatured === b.isMatured) ? 0 : a.isMatured ? 1 : -1) // Matured packages first
                .map((pkg) => (
                <Card 
                  key={pkg._id}
                  bg="#1E2528" 
                  borderWidth="1px" 
                  borderColor="#FDB137"
                  position="relative"
                  overflow="hidden"
                  _hover={{ 
                    transform: 'translateY(-5px)',
                    boxShadow: '0 0 15px rgba(253, 177, 55, 0.3)',
                    borderColor: '#FDB137',
                    transition: 'all 0.3s ease'
                  }}
                  transition="all 0.2s ease"
                >
                  <CardBody p={3}>
                    <VStack align="start" spacing={2}>
                      <Flex justify="space-between" width="100%" align="center">
                        <Badge 
                          bg="#FDB137"
                          color="#181E20"
                          fontSize="xs"
                          fontWeight="bold"
                        >
                          PKG {pkg.packageType}
                        </Badge>
                        <Badge 
                          bg="#FDB137" 
                          color="#181E20"
                          fontSize="xs"
                        >
                          {pkg.isMatured ? 'MATURED' : 'ACTIVE'}
                        </Badge>
                      </Flex>
                      <Box width="100%">
                        <Flex justify="space-between">
                          <Text color="gray.400" fontSize="xs">Investment</Text>
                          <Text color="white" fontSize="sm" fontWeight="bold">₱{pkg.amount.toLocaleString()}</Text>
                        </Flex>
                      </Box>
                      <Box width="100%">
                        <Flex justify="space-between">
                          <Text color="gray.400" fontSize="xs">Daily</Text>
                          <Text color="white" fontSize="xs">₱{pkg.dailyIncome.toLocaleString()}</Text>
                        </Flex>
                      </Box>
                      <Box width="100%">
                        <Flex justify="space-between" mb={1}>
                          <Text color="gray.400" fontSize="xs">Remaining</Text>
                          <Flex align="center">
                            <Text color="#FDB137" fontSize="sm" fontWeight="bold" mr={1}>
                              {pkg.daysRemaining}
                            </Text>
                            <Text color="gray.400" fontSize="xs">days</Text>
                          </Flex>
                        </Flex>
                        <Box width="100%" height="4px" bg="gray.700" borderRadius="full" overflow="hidden" position="relative">
                          <Box 
                            height="100%" 
                            width={`100%`} 
                            bg="#FDB137"
                            transition="width 0.5s ease-in-out"
                          />
                        </Box>
                      </Box>
                      <Box width="100%">
                        <Flex justify="space-between">
                          <Text color="gray.400" fontSize="xs">Total</Text>
                          <Text color="#FDB137" fontSize="sm" fontWeight="bold">₱{pkg.totalEarnings.toLocaleString()}</Text>
                        </Flex>
                      </Box>
                      {pkg.isMatured ? (
                        <Flex gap={2} mt={2}>
                          <Button
                            size="sm"
                            leftIcon={<FaGift />}
                            bg="#FDB137"
                            color="#181E20"
                            fontWeight="bold"
                            _hover={{
                              bg: '#BD5301',
                              color: 'white',
                              transform: 'scale(1.08)',
                              boxShadow: '0 0 10px #FDB137',
                            }}
                            transition="all 0.2s"
                            onClick={() => handleClaimPackage(pkg._id)}
                            title="Claim your matured package earnings!"
                            flex={1}
                          >
                            Claim
                          </Button>
                          {getAvailableRolloverOptions(pkg.packageType).length > 0 && (
                            <Button
                              size="sm"
                              leftIcon={<FaExchangeAlt />}
                              bg="#48BB78"
                              color="white"
                              fontWeight="bold"
                              _hover={{
                                bg: '#38A169',
                                transform: 'scale(1.08)',
                                boxShadow: '0 0 10px #48BB78',
                              }}
                              transition="all 0.2s"
                              onClick={() => handleRolloverClick(pkg)}
                              title="Rollover to a higher tier package!"
                              flex={1}
                            >
                              Rollover
                            </Button>
                          )}
                        </Flex>
                      ) : (
                        <Button
                          mt={2}
                          size="sm"
                          bg="gray.700"
                          color="gray.400"
                          fontWeight="bold"
                          isDisabled
                          transition="all 0.2s"
                        >
                          Not Yet Matured
                        </Button>
                      )}
                    </VStack>
                  </CardBody>
                </Card>
              ))}
            </SimpleGrid>
          </Box>
        )}

        {/* Shared Capital Packages */}
        <Box mt={8}>
          <Heading 
            as="h2" 
            fontSize="22px" 
            fontWeight="600" 
            color="white" 
            mb={4}
            fontFamily="'Montserrat', sans-serif"
          >
            Generate Passive Income Through Shared Capital
          </Heading>
          <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={4}>
            <SharedCapitalPackage
              packageNumber={1}
              minimum={100}
              onEnter={(amount) => handlePackageEnter(amount, 1)}
              walletBalance={stats.wallet}
            />
            <SharedCapitalPackage
              packageNumber={2}
              minimum={500}
              onEnter={(amount) => handlePackageEnter(amount, 2)}
              walletBalance={stats.wallet}
            />
            <SharedCapitalPackage
              packageNumber={3}
              minimum={1000}
              onEnter={(amount) => handlePackageEnter(amount, 3)}
              walletBalance={stats.wallet}
            />
          </SimpleGrid>
        </Box>

        {/* Rollover Modal */}
        <Modal isOpen={isRolloverOpen} onClose={onRolloverClose} size="md">
          <ModalOverlay />
          <ModalContent bg="#1E2528" borderWidth="1px" borderColor="gray.700">
            <ModalHeader color="white" fontFamily="'Montserrat', sans-serif">
              Rollover Package
            </ModalHeader>
            <ModalCloseButton color="white" />
            <ModalBody>
              {selectedPackageForRollover && (
                <VStack spacing={4} align="stretch">
                  <Box>
                    <Text color="gray.400" fontSize="sm" mb={2}>
                      Current Package Details:
                    </Text>
                    <Card bg="#181E20" borderWidth="1px" borderColor="gray.600">
                      <CardBody p={3}>
                        <VStack spacing={2} align="start">
                          <Flex justify="space-between" width="100%">
                            <Text color="gray.400" fontSize="xs">Package Type</Text>
                            <Badge bg="#FDB137" color="#181E20" fontSize="xs">
                              PKG {selectedPackageForRollover.packageType}
                            </Badge>
                          </Flex>
                          <Flex justify="space-between" width="100%">
                            <Text color="gray.400" fontSize="xs">Investment</Text>
                            <Text color="white" fontSize="sm">₱{selectedPackageForRollover.amount.toLocaleString()}</Text>
                          </Flex>
                          <Flex justify="space-between" width="100%">
                            <Text color="gray.400" fontSize="xs">Total Earnings</Text>
                            <Text color="#FDB137" fontSize="sm" fontWeight="bold">₱{selectedPackageForRollover.totalEarnings.toLocaleString()}</Text>
                          </Flex>
                        </VStack>
                      </CardBody>
                    </Card>
                  </Box>

                  <Box>
                    <Text color="gray.400" fontSize="sm" mb={3}>
                      Select Target Package:
                    </Text>
                    <RadioGroup value={selectedTargetPackage} onChange={setSelectedTargetPackage}>
                      <Stack spacing={3}>
                        {getAvailableRolloverOptions(selectedPackageForRollover.packageType).map((option) => (
                          <Card 
                            key={option.value}
                            bg={selectedTargetPackage === option.value ? "#2D3748" : "#181E20"}
                            borderWidth="1px"
                            borderColor={selectedTargetPackage === option.value ? "#48BB78" : "gray.600"}
                            cursor="pointer"
                            _hover={{ borderColor: "#48BB78" }}
                            transition="all 0.2s"
                          >
                            <CardBody p={3}>
                              <Flex align="center" gap={3}>
                                <Radio 
                                  value={option.value} 
                                  colorScheme="green"
                                  size="lg"
                                />
                                <VStack align="start" spacing={1} flex={1}>
                                  <Text color="white" fontWeight="bold" fontSize="sm">
                                    {option.label}
                                  </Text>
                                  <Text color="gray.400" fontSize="xs">
                                    {option.description}
                                  </Text>
                                </VStack>
                              </Flex>
                            </CardBody>
                          </Card>
                        ))}
                      </Stack>
                    </RadioGroup>
                  </Box>

                  <Box bg="#2D3748" p={3} borderRadius="md" borderWidth="1px" borderColor="gray.600">
                    <Text color="gray.300" fontSize="xs" textAlign="center">
                      <strong>Note:</strong> Your current package earnings (₱{selectedPackageForRollover.totalEarnings.toLocaleString()}) will be used as the investment amount for the new package.
                    </Text>
                  </Box>
                </VStack>
              )}
            </ModalBody>
            <ModalFooter>
              <Button 
                variant="ghost" 
                mr={3} 
                onClick={onRolloverClose}
                color="gray.400"
                _hover={{ color: "white" }}
              >
                Cancel
              </Button>
              <Button 
                bg="#48BB78" 
                color="white"
                _hover={{ bg: '#38A169' }}
                onClick={handleRolloverConfirm}
                isLoading={isRolloverLoading}
                loadingText="Processing..."
                isDisabled={!selectedTargetPackage || isRolloverLoading}
                leftIcon={<FaExchangeAlt />}
              >
                Confirm Rollover
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </Container>
    </AgentLayout>
  );
}