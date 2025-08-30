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
  Input,
  FormControl,
  FormLabel,
  Card,
  CardBody,
  Badge,
  Text,
  HStack,
  InputGroup,
  InputLeftElement,
  Icon,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Tooltip,
  Spinner,
  Flex,
  Select,
  IconButton
} from '@chakra-ui/react';
import { useState, useEffect } from 'react';
import axios from 'axios';
import AdminLayout from '../../components/AdminLayout';
import { 
  FaSearch, 
  FaFilter, 
  FaCheckCircle, 
  FaChevronLeft, 
  FaChevronRight 
} from 'react-icons/fa';

export default function SharedWithdrawal() {
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(false);

  const [filter, setFilter] = useState('pending');
  const [processingId, setProcessingId] = useState(null);
  const toast = useToast();
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const filteredWithdrawals = withdrawals.filter(w => {
    if (filter === 'pending') return w.status === 'pending';
    if (filter === 'approved') return w.status === 'approved' || w.status === 'completed';
    return true;
  });

  // Calculate paginated withdrawals
  const totalPages = Math.ceil(filteredWithdrawals.length / itemsPerPage);
  const paginatedWithdrawals = filteredWithdrawals.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset to first page when filter/search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter]);

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

  useEffect(() => {
    fetchPendingWithdrawals();
  }, []);

  const fetchPendingWithdrawals = async () => {
    try {
      const response = await axios.get('/admin/withdrawals/shared');
      console.log('Fetched shared withdrawals:', response.data);
      setWithdrawals(response.data);
    } catch (error) {
      toast({
        title: 'Error fetching withdrawals',
        description: error.response?.data?.message || 'Something went wrong',
        status: 'error',
        duration: 3000,
      });
    }
  };

  const approveWithdrawal = async (withdrawalId) => {
    setProcessingId(withdrawalId);
    setLoading(true);
    try {
      const response = await axios.post(`/admin/withdrawals/shared/${withdrawalId}/approve`);
      toast({
        title: 'Success',
        description: 'Withdrawal approved and moved to history',
        status: 'success',
        duration: 3000,
      });
      // Remove the approved withdrawal from the list
      setWithdrawals(withdrawals.filter(w => w._id !== withdrawalId));
      fetchPendingWithdrawals();
    } catch (error) {
      toast({
        title: 'Error approving withdrawal',
        description: error.response?.data?.message || 'Something went wrong',
        status: 'error',
        duration: 3000,
      });
    } finally {
      setLoading(false);
      setProcessingId(null);
    }
  };

  useEffect(() => {
    fetchPendingWithdrawals();
  }, []);


  const getTotalAmount = () => {
    return withdrawals
      .filter(w => w.status === 'approved' || w.status === 'completed')
      .reduce((sum, w) => sum + w.amount, 0);
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
                  ₱{getTotalAmount().toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </StatNumber>
                <StatHelpText color="hsl(220, 14%, 70%)">
                  {withdrawals.length} requests
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
                  {withdrawals.filter(w => w.status === 'pending').length}
                </StatNumber>
                <StatHelpText color="hsl(220, 14%, 70%)">
                  ₱{withdrawals
                    .filter(w => w.status === 'pending')
                    .reduce((sum, w) => sum + (w.amount || 0), 0)
                    .toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
                    >
                      
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      
                    </Select>
                  </HStack>
                </FormControl>
              </HStack>

              <Box overflowX="auto" borderRadius="md" borderWidth="1px" borderColor="#181E20">
                <Table variant="simple" colorScheme="gray">
                  <Thead>
                    <Tr bgColor="#181E20">
                      <Th color="hsl(220, 14%, 90%)" textAlign="left" px={4} py={3}>USER</Th>
                      <Th color="hsl(220, 14%, 90%)" textAlign="left" px={4} py={3}>PACKAGE</Th>
                      <Th color="hsl(220, 14%, 90%)" textAlign="left" px={4} py={3}>AMOUNT</Th>
                      <Th color="hsl(220, 14%, 90%)" textAlign="left" px={4} py={3}>PAYMENT</Th>
                      <Th color="hsl(220, 14%, 90%)" textAlign="left" px={4} py={3}>DATE</Th>
                      <Th color="hsl(220, 14%, 90%)" textAlign="center" px={4} py={3}>STATUS</Th>
                      <Th color="hsl(220, 14%, 90%)" textAlign="center" px={4} py={3}>ACTIONS</Th>
                    </Tr>
                  </Thead>
              <Tbody>
                    {loading ? (
                      <Tr>
                        <Td colSpan={7} textAlign="center" py={8}>
                          <Spinner size="lg" color="#FDB137" />
                          <Text mt={2} color="hsl(220, 14%, 70%)">Loading withdrawals...</Text>
                        </Td>
                      </Tr>
                    ) : paginatedWithdrawals.length === 0 ? (
                      <Tr>
                        <Td colSpan={7} textAlign="center" py={8} color="hsl(220, 14%, 70%)" bg="#242C2E">
                          No withdrawal requests found
                        </Td>
                      </Tr>
                    ) : (
                      paginatedWithdrawals.map((withdrawal) => (
                        <Tr key={withdrawal._id} _hover={{ bg: "#2A3336" }} bg="#242C2E">
                          <Td color="hsl(220, 14%, 90%)" verticalAlign="middle" px={4} py={3}>
                            <VStack align="start" spacing={0}>
                              <Text fontWeight="bold" fontSize="md" color="#FDB137">
                                {withdrawal.agentId?.username || 'N/A'}
                              </Text>
                              <Text fontSize="sm" color="hsl(220, 14%, 70%)">
                                {withdrawal.agentId?.email || 'N/A'}
                              </Text>
                            </VStack>
                          </Td>
                          <Td verticalAlign="middle" px={4} py={3}>
                            <Badge 
                              colorScheme={withdrawal.package === 1 ? 'blue' : 'purple'}
                              fontSize="xs"
                              px={2}
                              py={1}
                              borderRadius="md"
                            >
                              {withdrawal.package === 1 ? '12 Days' : withdrawal.package === 2 ? '20 Days' : '30 Days'}
                            </Badge>
                          </Td>
                          <Td color="#FDB137" fontWeight="bold" verticalAlign="middle" px={4} py={3}>
                            ₱{withdrawal.amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </Td>
                          <Td verticalAlign="middle" px={4} py={3}>
                            <VStack align="start" spacing={0}>
                              <Text color="hsl(220, 14%, 90%)" fontSize="sm" textTransform="uppercase">
                                {withdrawal.method || 'N/A'}
                              </Text>
                              <Text fontSize="xs" color="hsl(220, 14%, 70%)">
                                {withdrawal.accountNumber || 'N/A'}
                              </Text>
                              <Text fontSize="xs" color="#FDB137" fontWeight="bold">
                                {withdrawal.accountName || 'N/A'}
                              </Text>
                            </VStack>
                          </Td>
                          <Td color="hsl(220, 14%, 80%)" fontSize="sm" verticalAlign="middle" px={4} py={3}>
                            {new Date(withdrawal.createdAt).toLocaleString()}
                          </Td>
                          <Td verticalAlign="middle" px={4} py={3}>
                            <Badge
                              colorScheme={getStatusColor(withdrawal.status)}
                              px={2}
                              py={1}
                              borderRadius="md"
                              textTransform="uppercase"
                              fontSize="xs"
                              width="100%"
                              textAlign="center"
                            >
                              {withdrawal.status}
                            </Badge>
                          </Td>
                          <Td verticalAlign="middle" px={4} py={3}>
                            {withdrawal.status === 'pending' ? (
                              <Button
                                    size="sm"
                                    colorScheme="green"
                                    leftIcon={<FaCheckCircle />}
                                    isLoading={loading && processingId === withdrawal._id}
                                    onClick={() => approveWithdrawal(withdrawal._id)}
                                    _hover={{ transform: 'translateY(-1px)' }}
                                  >
                                    Approve
                                  </Button>
                            ) : (
                              <Text color="hsl(220, 14%, 70%)" fontSize="sm">
                                {withdrawal.status === 'approved' ? 'Approved' : 'Rejected'}
                              </Text>
                            )}
                          </Td>
                        </Tr>
                      ))
                    )}
                  </Tbody>
                </Table>
              </Box>
              {/* Pagination Controls */}
              {totalPages > 1 && (
                <HStack justify="center" pt={4}>
                  <Button
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                    isDisabled={currentPage === 1}
                    bg="#242C2E"
                    color="white"
                    borderColor="#181E20"
                    _hover={{ bg: '#FDB137', color: '#181E20' }}
                  >
                    Previous
                  </Button>
                  {Array.from({ length: totalPages }, (_, i) => (
                    <Button
                      key={i + 1}
                      size="sm"
                      onClick={() => setCurrentPage(i + 1)}
                      bg={currentPage === i + 1 ? '#FDB137' : '#242C2E'}
                      color={currentPage === i + 1 ? '#181E20' : 'white'}
                      borderColor="#181E20"
                      _hover={{ bg: '#FDB137', color: '#181E20' }}
                    >
                      {i + 1}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                    isDisabled={currentPage === totalPages}
                    bg="#242C2E"
                    color="white"
                    borderColor="#181E20"
                    _hover={{ bg: '#FDB137', color: '#181E20' }}
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
