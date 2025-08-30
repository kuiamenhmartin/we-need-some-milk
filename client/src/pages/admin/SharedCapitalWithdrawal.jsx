import {
  Box,
  VStack,
  Heading,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Button,
  useToast,
  Card,
  CardBody,
  Text,
  Badge,
  HStack,
  Tooltip,
  Input,
  InputGroup,
  InputLeftElement,
  Select,
  FormControl,
  FormLabel,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Flex,
  Spinner,
  Icon
} from '@chakra-ui/react';
import { useState, useEffect } from 'react';
import axios from 'axios';
import AdminLayout from '../../components/AdminLayout';
import { FaCheckCircle, FaInfoCircle, FaSearch, FaFilter, FaMoneyBillWave } from 'react-icons/fa';

export default function SharedCapitalWithdrawal() {
  const [withdrawals, setWithdrawals] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [searchEmail, setSearchEmail] = useState('');
  const [filter, setFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const toast = useToast();

  const filteredWithdrawals = withdrawals.filter(withdrawal => {
    const matchesSearch = !searchEmail || 
      (withdrawal.user?.email || '').toLowerCase().includes(searchEmail.toLowerCase());
    const matchesFilter = filter === 'all' || withdrawal.status === filter;
    return matchesSearch && matchesFilter;
  });

  const totalPages = Math.ceil(filteredWithdrawals.length / itemsPerPage);
  const paginatedWithdrawals = filteredWithdrawals.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Calculate summary stats
  const getTotalAmount = (status) => {
    return withdrawals
      .filter(w => status === 'all' || w.status === status)
      .reduce((sum, w) => sum + (w.amount || 0), 0);
  };

  const getWithdrawalCount = (status) => {
    return withdrawals.filter(w => status === 'all' ? true : w.status === status).length;
  };

  useEffect(() => {
    fetchWithdrawals();
  }, []);

  const fetchWithdrawals = async () => {
    try {
      const response = await axios.get('/admin/withdrawals/shared');
      console.log('Fetched shared capital withdrawals:', response.data);
      setWithdrawals(response.data);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch withdrawal requests',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const handleWithdrawalAction = async (id, action) => {
    setProcessingId(id);
    setIsLoading(true);
    try {
      await axios.post(`/admin/withdrawals/shared/${id}/${action}`);
      
      toast({
        title: 'Success',
        description: `Withdrawal ${action}ed successfully`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });

      fetchWithdrawals();
    } catch (error) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || `Failed to ${action} withdrawal`,
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setIsLoading(false);
      setProcessingId(null);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending':
        return 'yellow';
      case 'approved':
        return 'green';
      case 'rejected':
        return 'red';
      default:
        return 'gray';
    }
  };

  const getPackageLabel = (packageType) => {
    switch (packageType) {
      case 1:
        return '12 Days';
      case 2:
        return '20 Days';
      default:
        return 'Unknown';
    }
  };

  return (
    <AdminLayout>
      <VStack spacing={6} align="stretch" px={{ base: 2, md: 8 }}>
        <Box>
          <Heading size="lg" color="hsl(220, 14%, 90%)" textAlign="left">
            Shared Capital Withdrawals
          </Heading>
          <Text color="hsl(220, 14%, 70%)" textAlign="left">
            Manage and process shared capital withdrawal requests
          </Text>
        </Box>

        {/* Summary Cards */}
        <Flex gap={4} flexWrap="wrap" justify="flex-start" align="stretch" mb={2}>
          <Card 
            flex={1} 
            minW="250px" 
            bg="#242C2E" 
            borderColor="#181E20" 
            borderWidth="1px"
            boxShadow="dark-lg"
            p={0}
          >
            <CardBody px={6} py={4}>
              <Stat>
                <StatLabel color="hsl(220, 14%, 70%)">Total Withdrawals</StatLabel>
                <StatNumber fontSize="2xl" fontWeight="bold" color="#FDB137">
                  ₱{getTotalAmount('all').toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </StatNumber>
                <StatHelpText color="hsl(220, 14%, 70%)">
                  {getWithdrawalCount('all')} requests
                </StatHelpText>
              </Stat>
            </CardBody>
          </Card>

          <Card 
            flex={1} 
            minW="250px" 
            bg="#242C2E" 
            borderColor="#181E20" 
            borderWidth="1px"
            boxShadow="dark-lg"
            p={0}
          >
            <CardBody px={6} py={4}>
              <Stat>
                <StatLabel color="hsl(220, 14%, 70%)">Pending Approval</StatLabel>
                <StatNumber fontSize="2xl" fontWeight="bold" color="yellow.400">
                  {getWithdrawalCount('pending')}
                </StatNumber>
                <StatHelpText color="hsl(220, 14%, 70%)">
                  ₱{getTotalAmount('pending').toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </StatHelpText>
              </Stat>
            </CardBody>
          </Card>
        </Flex>

        <Card 
          bg="#242C2E" 
          borderColor="#181E20" 
          borderWidth="1px"
          boxShadow="dark-lg"
        >
          <CardBody>
            <VStack spacing={6} align="stretch">
              <HStack spacing={4} width="full" flexWrap={{ base: "wrap", md: "nowrap" }}>
                <FormControl maxW={{ base: "full", md: "300px" }}>
                  <InputGroup>
                    <InputLeftElement pointerEvents="none">
                      <FaSearch color="#FDB137" />
                    </InputLeftElement>
                    <Input
                      id="search-email"
                      name="searchEmail"
                      placeholder="Search by email..."
                      value={searchEmail}
                      onChange={(e) => setSearchEmail(e.target.value)}
                      bg="#242C2E"
                      borderColor="#181E20"
                      color="hsl(220, 14%, 90%)"
                      _placeholder={{ color: 'hsl(220, 14%, 50%)' }}
                      _hover={{ borderColor: '#FDB137' }}
                      _focus={{ borderColor: '#FDB137', boxShadow: '0 0 0 1px #FDB137' }}
                    />
                  </InputGroup>
                </FormControl>
                <FormControl maxW={{ base: "full", md: "200px" }}>
                  <HStack spacing={2}>
                    <Icon as={FaFilter} color="#FDB137" />
                    <Select
                      id="status-filter"
                      name="statusFilter"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      bg="black"
                      borderColor="#181E20"
                      color="#FDB137"
                      _hover={{ borderColor: '#FDB137' }}
                      _focus={{ 
                        borderColor: '#FDB137', 
                        boxShadow: '0 0 0 1px #FDB137',
                        bg: 'black',
                        color: '#FDB137'
                      }}
                      sx={{
                        '> option': {
                          backgroundColor: 'black',
                          color: '#FDB137',
                          _hover: {
                            backgroundColor: '#2A3336 !important',
                          },
                        },
                        '&:focus': {
                          bg: 'black',
                          color: '#FDB137'
                        }
                      }}
                      css={{
                        '& option': {
                          backgroundColor: 'black',
                          color: '#FDB137',
                        },
                        '&:focus, &:active': {
                          backgroundColor: 'black !important',
                          color: '#FDB137 !important',
                        },
                      }}
                    >
                      <option value="all">All Status</option>
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                    </Select>
                  </HStack>
                </FormControl>
              </HStack>

              <Box overflowX="auto">
                <Table variant="simple" colorScheme="gray">
                  <Thead>
                    <Tr bgColor="#181E20">
                      <Th color="hsl(220, 14%, 90%)" textAlign="left" px={4} py={3}>User</Th>
                      <Th color="hsl(220, 14%, 90%)" textAlign="left" px={4} py={3}>Package</Th>
                      <Th color="hsl(220, 14%, 90%)" textAlign="left" px={4} py={3}>Amount</Th>
                      <Th color="hsl(220, 14%, 90%)" textAlign="left" px={4} py={3}>Payment</Th>
                      <Th color="hsl(220, 14%, 90%)" textAlign="left" px={4} py={3}>Status</Th>
                      <Th color="hsl(220, 14%, 90%)" textAlign="left" px={4} py={3}>Date</Th>
                      <Th color="hsl(220, 14%, 90%)" textAlign="center" px={4} py={3}>Actions</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {isLoading ? (
                      <Tr>
                        <Td colSpan={8} textAlign="center" py={8}>
                          <Spinner size="lg" color="#FDB137" />
                          <Text mt={2} color="hsl(220, 14%, 70%)">Loading withdrawals...</Text>
                        </Td>
                      </Tr>
                    ) : paginatedWithdrawals.length === 0 ? (
                      <Tr>
                        <Td colSpan={8} textAlign="center" py={8} color="hsl(220, 14%, 70%)">
                          No withdrawal requests found
                        </Td>
                      </Tr>
                    ) : (
                      paginatedWithdrawals.map((withdrawal) => (
                        <Tr key={withdrawal._id} _hover={{ bg: '#2A3336' }}>
                          <Td color="hsl(220, 14%, 90%)" verticalAlign="middle" px={4} py={3}>
                            <VStack align="start" spacing={0}>
                              <Text fontWeight="bold" fontSize="md" color="#FDB137">
                                {withdrawal.user?.username || 'N/A'}
                              </Text>
                              <Text fontSize="sm" color="hsl(220, 14%, 70%)">
                                {withdrawal.user?.email || 'N/A'}
                              </Text>
                            </VStack>
                          </Td>
                          <Td verticalAlign="middle" px={4} py={3}>
                            <Tooltip label={`Package Type ${withdrawal.packageType}`} hasArrow>
                              <Badge colorScheme="purple" fontSize="xs" px={2} py={1}>
                                {getPackageLabel(withdrawal.packageType)}
                              </Badge>
                            </Tooltip>
                          </Td>
                          <Td color="#FDB137" fontWeight="bold" verticalAlign="middle" px={4} py={3}>
                            ₱{withdrawal.amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </Td>
                          <Td verticalAlign="middle" px={4} py={3}>
                            <VStack align="start" spacing={0}>
                              <Text color="hsl(220, 14%, 90%)" fontSize="sm">
                                {withdrawal.method || 'N/A'}
                              </Text>
                              <Text fontSize="xs" color="hsl(220, 14%, 70%)">
                                {withdrawal.accountNumber || 'N/A'}
                              </Text>
                              <Text fontSize="xs" color="hsl(220, 14%, 70%)">
                                {withdrawal.accountName || 'N/A'}
                              </Text>
                            </VStack>
                          </Td>
                          <Td verticalAlign="middle" px={4} py={3}>
                            <Badge 
                              colorScheme={getStatusColor(withdrawal.status)} 
                              fontSize="xs"
                              px={2}
                              py={1}
                              borderRadius="md"
                              textTransform="uppercase"
                            >
                              {withdrawal.status}
                            </Badge>
                          </Td>
                          <Td color="hsl(220, 14%, 80%)" fontSize="sm" verticalAlign="middle" px={4} py={3}>
                            {new Date(withdrawal.createdAt).toLocaleString()}
                          </Td>
                          <Td verticalAlign="middle" px={4} py={3}>
                            {withdrawal.status === 'pending' ? (
                              <HStack spacing={2} justify="center">
                                <Tooltip label="Approve Withdrawal" hasArrow>
                                  <Button
                                    size="sm"
                                    colorScheme="green"
                                    leftIcon={<FaCheckCircle />}
                                    isLoading={isLoading && processingId === withdrawal._id}
                                    onClick={() => handleWithdrawalAction(withdrawal._id, 'approve')}
                                    _hover={{ transform: 'translateY(-1px)' }}
                                    transition="all 0.2s"
                                  >
                                    Approve
                                  </Button>
                                </Tooltip>
                              </HStack>
                            ) : (
                              <Tooltip label={`Already ${withdrawal.status}`} hasArrow>
                                <Box textAlign="center">
                                  <FaInfoCircle color="hsl(220, 14%, 60%)" />
                                </Box>
                              </Tooltip>
                            )}
                          </Td>
                        </Tr>
                      ))
                    )}
                  </Tbody>
                </Table>
              </Box>

              {/* Pagination */}
              {totalPages > 1 && (
                <HStack justify="flex-end" mt={4} spacing={4}>
                  <Button
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    isDisabled={currentPage === 1}
                    variant="outline"
                    colorScheme="gray"
                  >
                    Previous
                  </Button>
                  <Text color="hsl(220, 14%, 70%)">
                    Page {currentPage} of {totalPages}
                  </Text>
                  <Button
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    isDisabled={currentPage === totalPages}
                    variant="outline"
                    colorScheme="gray"
                  >
                    Next
                  </Button>
                </HStack>
              )}
            </VStack>
          </CardBody>
        </Card>
      </VStack>
    </AdminLayout>
  );
}