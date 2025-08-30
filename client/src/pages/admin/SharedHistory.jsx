import React, { useState, useEffect } from 'react';
import {
  Box,
  Heading,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  Input,
  Select,
  HStack,
  Text,
  VStack,
  Icon,
  Card,
  CardBody,
  FormControl,
  FormLabel,
  InputGroup,
  InputLeftElement,
  IconButton,
  Button,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Flex,
  Spinner,
  Tooltip
} from '@chakra-ui/react';
import { 
  FaSearch, 
  FaFilter, 
  FaCalendar, 
  FaChevronLeft, 
  FaChevronRight,
  FaInfoCircle
} from 'react-icons/fa';
import axios from 'axios';
import { format } from 'date-fns';
import AdminLayout from '../../components/AdminLayout';

const SharedHistory = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchTransactions();

    // Set up auto-refresh every 30 seconds
    const interval = setInterval(fetchTransactions, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/admin/withdrawals/shared');
      setTransactions(response.data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'deposit':
        return 'blue';
      case 'withdrawal':
        return 'orange';
      case 'earning':
        return 'green';
      default:
        return 'gray';
    }
  };

  const filteredTransactions = transactions.filter(transaction => {
    const matchesFilter = filter === 'all' || transaction.status === filter;
    const matchesSearch = search === '' || 
      (transaction.agentId?.username || '').toLowerCase().includes(search.toLowerCase()) ||
      (transaction.agentId?.email || '').toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const paginatedTransactions = filteredTransactions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, search]);

  // Calculate summary stats
  const getTotalAmount = (status) => {
    return transactions
      .filter(t => status === 'all' || t.status === status)
      .reduce((sum, t) => sum + (t.amount || 0), 0);
  };

  const getTransactionCount = (status) => {
    return transactions.filter(t => status === 'all' || t.status === status).length;
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'green';
      case 'pending':
        return 'yellow';
      case 'rejected':
        return 'red';
      default:
        return 'gray';
    }
  };

  return (
    <AdminLayout>
      <VStack spacing={6} align="stretch" px={{ base: 2, md: 8 }}>
        <Box>
          <Heading size="lg" color="hsl(220, 14%, 90%)" textAlign="left">
            Shared Capital Withdrawal History
          </Heading>
          <Text color="hsl(220, 14%, 70%)" textAlign="left">
            View all shared capital withdrawal transactions and their status
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
                  {getTransactionCount('all')} transactions
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
                <StatLabel color="hsl(220, 14%, 70%)">Approved</StatLabel>
                <StatNumber fontSize="2xl" fontWeight="bold" color="green.400">
                  {getTransactionCount('completed')}
                </StatNumber>
                <StatHelpText color="hsl(220, 14%, 70%)">
                  ₱{getTotalAmount('completed').toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
                <StatLabel color="hsl(220, 14%, 70%)">Pending</StatLabel>
                <StatNumber fontSize="2xl" fontWeight="bold" color="yellow.400">
                  {getTransactionCount('pending')}
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
                      placeholder="Search by username or email"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      bg="#242C2E"
                      color="hsl(220, 14%, 90%)"
                      borderColor="#181E20"
                      _placeholder={{ color: 'hsl(220, 14%, 50%)' }}
                      _hover={{ borderColor: '#FDB137' }}
                      _focus={{ 
                        borderColor: '#FDB137', 
                        boxShadow: '0 0 0 1px #FDB137',
                        bg: '#242C2E',
                        color: 'hsl(220, 14%, 90%)'
                      }}
                    />
                  </InputGroup>
                </FormControl>

                <FormControl maxW={{ base: "full", md: "200px" }}>
                  <HStack spacing={2}>
                    <Icon as={FaFilter} color="#FDB137" />
                    <Select
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
                      <option value="all">All Status</option>
                      <option value="completed">Approved</option>
                      <option value="pending">Pending</option>
                      <option value="rejected">Rejected</option>
                    </Select>
                  </HStack>
                </FormControl>

                <FormControl maxW={{ base: "full", md: "200px" }}>
                  <HStack spacing={2}>
                    <Icon as={FaCalendar} color="#FDB137" />
                    <Select
                      value={dateRange}
                      onChange={(e) => setDateRange(e.target.value)}
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
                      <option value="all">All Time</option>
                      <option value="today">Today</option>
                      <option value="week">This Week</option>
                      <option value="month">This Month</option>
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
                      <Th color="hsl(220, 14%, 90%)" textAlign="center" px={4} py={3}>STATUS</Th>
                      <Th color="hsl(220, 14%, 90%)" textAlign="left" px={4} py={3}>DATE</Th>
                      <Th color="hsl(220, 14%, 90%)" textAlign="left" px={4} py={3}>DETAILS</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {loading ? (
                      <Tr>
                        <Td colSpan={6} textAlign="center" py={8}>
                          <Spinner size="lg" color="#FDB137" />
                          <Text mt={2} color="hsl(220, 14%, 70%)">Loading transactions...</Text>
                        </Td>
                      </Tr>
                    ) : paginatedTransactions.length === 0 ? (
                      <Tr>
                        <Td colSpan={6} textAlign="center" py={8} color="hsl(220, 14%, 70%)">
                          No transactions found
                        </Td>
                      </Tr>
                    ) : (
                      paginatedTransactions.map((transaction) => (
                        <Tr key={transaction._id} _hover={{ bg: '#2A3336' }} bg="#242C2E">
                          <Td color="hsl(220, 14%, 90%)" verticalAlign="middle" px={4} py={3}>
                            <VStack align="start" spacing={0}>
                              <Text fontWeight="bold" fontSize="md" color="#FDB137">
                                {transaction.agentId?.username || 'Unknown User'}
                              </Text>
                              <Text fontSize="sm" color="hsl(220, 14%, 70%)">
                                {transaction.agentId?.email || 'N/A'}
                              </Text>
                            </VStack>
                          </Td>
                          <Td verticalAlign="middle" px={4} py={3}>
                            <Badge 
                              colorScheme={transaction.package === 'Package 1' ? 'blue' : 'purple'}
                              fontSize="xs"
                              px={2}
                              py={1}
                              borderRadius="md"
                            >
                              {transaction.package}
                            </Badge>
                          </Td>
                          <Td color="#FDB137" fontWeight="bold" verticalAlign="middle" px={4} py={3}>
                            ₱{transaction.amount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                          </Td>
                          <Td verticalAlign="middle" px={4} py={3}>
                            <Badge
                              colorScheme={getStatusColor(transaction.status)}
                              px={2}
                              py={1}
                              borderRadius="md"
                              textTransform="uppercase"
                              fontSize="xs"
                              width="100%"
                              textAlign="center"
                            >
                              {transaction.status}
                            </Badge>
                          </Td>
                          <Td color="hsl(220, 14%, 80%)" fontSize="sm" verticalAlign="middle" px={4} py={3}>
                            {transaction.createdAt ? format(new Date(transaction.createdAt), 'MMM dd, yyyy hh:mm a') : '-'}
                          </Td>
                          <Td verticalAlign="middle" px={4} py={3}>
                            <Tooltip 
                              label={transaction.description || 'No details available'} 
                              hasArrow 
                              placement="top"
                              maxW="300px"
                              bg="#242C2E"
                              color="hsl(220, 14%, 90%)"
                              border="1px solid #181E20"
                            >
                              <Box>
                                <Text 
                                  color="hsl(220, 14%, 80%)" 
                                  fontSize="sm" 
                                  noOfLines={1}
                                  maxW="250px"
                                >
                                  {transaction.description || '-'}
                                </Text>
                              </Box>
                            </Tooltip>
                          </Td>
                        </Tr>
                      ))
                    )}
                  </Tbody>
                </Table>
              </Box>
              {totalPages > 1 && (
                <HStack justify="center" pt={4} spacing={2}>
                  <IconButton
                    aria-label="Previous page"
                    icon={<FaChevronLeft />}
                    onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                    isDisabled={currentPage === 1}
                    bg="#242C2E"
                    color="white"
                    borderColor="#181E20"
                    _hover={{ bg: '#FDB137', color: '#181E20' }}
                    size="sm"
                  />
                  
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    // Show first page, last page, and pages around current page
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    
                    if (i === 3 && currentPage < totalPages - 3) {
                      return <Text key="ellipsis" color="hsl(220, 14%, 70%)" px={2}>...</Text>;
                    }
                    
                    if (i === 4 && currentPage < totalPages - 2) {
                      return (
                        <Button
                          key={totalPages}
                          size="sm"
                          onClick={() => setCurrentPage(totalPages)}
                          bg={currentPage === totalPages ? '#FDB137' : '#242C2E'}
                          color={currentPage === totalPages ? '#181E20' : 'white'}
                          borderColor="#181E20"
                          _hover={{ bg: '#FDB137', color: '#181E20' }}
                        >
                          {totalPages}
                        </Button>
                      );
                    }
                    
                    return (
                      <Button
                        key={pageNum}
                        size="sm"
                        onClick={() => setCurrentPage(pageNum)}
                        bg={currentPage === pageNum ? '#FDB137' : '#242C2E'}
                        color={currentPage === pageNum ? '#181E20' : 'white'}
                        borderColor="#181E20"
                        _hover={{ bg: '#FDB137', color: '#181E20' }}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                  
                  <IconButton
                    aria-label="Next page"
                    icon={<FaChevronRight />}
                    onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                    isDisabled={currentPage === totalPages}
                    bg="#242C2E"
                    color="white"
                    borderColor="#181E20"
                    _hover={{ bg: '#FDB137', color: '#181E20' }}
                    size="sm"
                  />
                </HStack>
              )}
            </VStack>
          </CardBody>
        </Card>
      </VStack>
    </AdminLayout>
  );
};

export default SharedHistory;
