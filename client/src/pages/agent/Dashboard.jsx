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
  Image
} from '@chakra-ui/react';
import { FaWallet, FaUsers, FaChartLine, FaGift } from 'react-icons/fa';
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
      // Compute daysRemaining for each package
      const now = new Date();
      const packages = Array.isArray(packagesRes.data) ? packagesRes.data : packagesRes.data?.packages || [];
      
      // Debug log to check received packages
      console.log('Received packages from server:', packages);
      
      const packagesWithDays = packages.map(pkg => {
        // Use the server-calculated values if available, otherwise calculate locally
        const start = new Date(pkg.startDate);
        const end = new Date(pkg.endDate);
        
        // Calculate days remaining and total days
        let daysRemaining, totalDays, isMatured;
        
        // Check if dates are valid
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          console.error('Invalid dates for package:', pkg._id, { 
            startDate: pkg.startDate, 
            endDate: pkg.endDate,
            packageType: pkg.packageType
          });
          daysRemaining = 0;
          totalDays = pkg.packageType === 1 ? 12 : pkg.packageType === 2 ? 20 : 30;
          isMatured = true;
        } else {
          totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
          const daysPassed = Math.ceil((now - start) / (1000 * 60 * 60 * 24));
          daysRemaining = Math.max(0, totalDays - daysPassed);
          isMatured = now >= end;
        }
        
        // Debug log for each package
        console.log('Processing package:', {
          _id: pkg._id,
          packageType: pkg.packageType,
          startDate: pkg.startDate,
          endDate: pkg.endDate,
          claimed: pkg.claimed,
          isMatured,
          daysRemaining,
          totalDays
        });
        
        return { ...pkg, daysRemaining, totalDays, isMatured };
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
                      <Button
                        mt={2}
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
                      >
                        Claim
                      </Button>
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
      </Container>
    </AgentLayout>
  );
}