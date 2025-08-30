const User = require('../models/User');
const Investment = require('../models/Investment');
const Transaction = require('../models/Transaction');
const Settings = require('../models/Settings');
const Withdrawal = require('../models/Withdrawal');
const Package = require('../models/Package');
const SharedCapitalTransaction = require('../models/sharedCapitalTransaction');
const bcrypt = require('bcryptjs');

exports.updateUserRole = async (req, res) => {
    try {
        const { userId, role } = req.body;
        
        // Only allow admin role updates
        if (!['admin', 'agent'].includes(role)) {
            return res.status(400).json({ message: 'Invalid role' });
        }

        const user = await User.findByIdAndUpdate(
            userId,
            { role },
            { new: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({
            message: 'User role updated successfully',
            user
        });
    } catch (error) {
        console.error('Update user role error:', error);
        res.status(500).json({ message: 'Error updating user role' });
    }
};

exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.json(users);
    } catch (error) {
        console.error('Get all users error:', error);
        res.status(500).json({ message: 'Error fetching users' });
    }
};

exports.getDashboardStats = async (req, res) => {
    try {
        // Get total users count
        const totalUsers = await User.countDocuments({ role: 'agent' });

        // Get total investments (only approved, active, or completed investments)
        const investmentStats = await Investment.aggregate([
            {
                $match: {
                    status: { $in: ['approved', 'active', 'completed'] }
                }
            },
            {
                $group: {
                    _id: null,
                    totalInvestments: { $sum: '$amount' }
                }
            }
        ]);
        const totalInvestments = investmentStats.length > 0 ? investmentStats[0].totalInvestments : 0;
        
        // Calculate total earnings from all agents (referral earnings + click earnings + shared earnings)
        const earningsStats = await User.aggregate([
            {
                $match: { role: 'agent' }
            },
            {
                $group: {
                    _id: null,
                    totalDirectReferral: { $sum: '$referralEarnings.direct' },
                    totalIndirectReferral: { $sum: '$referralEarnings.indirect' },
                    totalClickEarnings: { $sum: '$clickEarnings' },
                    totalSharedEarnings: { $sum: '$sharedEarnings' }
                }
            }
        ]);
        
        const totalReferralEarnings = (earningsStats[0]?.totalDirectReferral || 0) + 
                                    (earningsStats[0]?.totalIndirectReferral || 0);
        const totalEarnings = totalReferralEarnings + 
                            (earningsStats[0]?.totalClickEarnings || 0) +
                            (earningsStats[0]?.totalSharedEarnings || 0);

        // Get total withdrawals by source type
        const withdrawalsBySource = await Withdrawal.aggregate([
            {
                $match: { status: 'completed' }
            },
            {
                $group: {
                    _id: '$source',
                    total: { $sum: '$amount' }
                }
            }
        ]);

        // Get pending withdrawals by source type
        const pendingWithdrawalsBySource = await Withdrawal.aggregate([
            {
                $match: { status: 'pending' }
            },
            {
                $group: {
                    _id: '$source',
                    total: { $sum: '$amount' }
                }
            }
        ]);

        // Calculate totals
        const totalWithdrawals = withdrawalsBySource.reduce((sum, item) => sum + item.total, 0);
        const totalPendingWithdrawals = pendingWithdrawalsBySource.reduce((sum, item) => sum + item.total, 0);

        // Format withdrawal stats by source
        const withdrawalStats = {
            referral: withdrawalsBySource.find(item => item._id === 'direct_indirect')?.total || 0,
            click: withdrawalsBySource.find(item => item._id === 'click_earnings')?.total || 0,
            sharedCapital: withdrawalsBySource.find(item => item._id === 'shared_capital')?.total || 0,
            pending: {
                referral: pendingWithdrawalsBySource.find(item => item._id === 'direct_indirect')?.total || 0,
                click: pendingWithdrawalsBySource.find(item => item._id === 'click_earnings')?.total || 0,
                sharedCapital: pendingWithdrawalsBySource.find(item => item._id === 'shared_capital')?.total || 0,
                total: totalPendingWithdrawals
            },
            total: totalWithdrawals
        };

        res.json({
            totalUsers,
            totalInvestments,
            totalEarnings,
            totalReferralEarnings,
            totalSharedEarnings: earningsStats[0]?.totalSharedEarnings || 0,
            totalWithdrawals: withdrawalStats.total,
            pendingWithdrawals: withdrawalStats.pending.total,
            withdrawalStats
        });
    } catch (error) {
        console.error('Get dashboard stats error:', error);
        res.status(500).json({ message: 'Error fetching dashboard stats' });
    }
};

exports.loadRegistration = async (req, res) => {
    try {
        const { userId, amount } = req.body;
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Create transaction
        await new Transaction({
            user: userId,
            type: 'registration_load',
            amount: amount,
            description: 'Registration load by admin',
            status: 'completed'
        }).save();

        // Update user wallet
        await User.findByIdAndUpdate(userId, {
            $inc: { wallet: amount }
        });

        res.json({ message: 'Registration load successful' });
    } catch (error) {
        console.error('Error loading registration:', error);
        res.status(500).json({ message: 'Error loading registration' });
    }
};

exports.loadSharedCapital = async (req, res) => {
    try {
        const { userId, amount, packageType } = req.body;
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Create investment
        await new Investment({
            user: userId,
            amount: amount,
            package: packageType,
            status: 'active',
            startDate: new Date(),
            endDate: new Date(Date.now() + (packageType === 1 ? 12 : packageType === 2 ? 20 : 30) * 24 * 60 * 60 * 1000)
        }).save();

        res.json({ message: 'Shared capital loaded successfully' });
    } catch (error) {
        console.error('Error loading shared capital:', error);
        res.status(500).json({ message: 'Error loading shared capital' });
    }
};

exports.getEarningsTransactions = async (req, res) => {
    try {
        const transactions = await Transaction.find({ 
            $or: [
                { type: { $in: ['commission', 'click', 'referral'] } },
                { type: 'withdrawal', status: 'completed' }
            ]
        })
            .populate('user', '-password')
            .sort({ createdAt: -1 });
        res.json(transactions);
    } catch (error) {
        console.error('Get earnings transactions error:', error);
        res.status(500).json({ message: 'Error fetching earnings transactions' });
    }
};

exports.getEarningsWithdrawals = async (req, res) => {
    try {
        const withdrawals = await Withdrawal.find({ type: 'earnings' })
            .populate('user', '-password')
            .sort({ createdAt: -1 });
        res.json(withdrawals);
    } catch (error) {
        console.error('Get earnings withdrawals error:', error);
        res.status(500).json({ message: 'Error fetching earnings withdrawals' });
    }
};

exports.approveEarningsWithdrawal = async (req, res) => {
    try {
        const { id } = req.params;
        const withdrawal = await Withdrawal.findById(id);
        if (!withdrawal) {
            return res.status(404).json({ message: 'Withdrawal not found' });
        }

        withdrawal.status = 'completed';
        withdrawal.processedAt = new Date();
        await withdrawal.save();

        // Create a Transaction record for the approved withdrawal
        await Transaction.create({
            user: withdrawal.agentId,
            type: 'withdrawal',
            amount: withdrawal.amount,
            status: 'completed',
            withdrawal: withdrawal._id,
            description: `Earnings withdrawal of ₱${withdrawal.amount} approved via ${withdrawal.method}`
        });

        res.json({ message: 'Withdrawal approved successfully' });
    } catch (error) {
        console.error('Error approving withdrawal:', error);
        res.status(500).json({ message: 'Error approving withdrawal' });
    }
};

exports.rejectEarningsWithdrawal = async (req, res) => {
    try {
        const { id } = req.params;
        const withdrawal = await Withdrawal.findById(id);
        if (!withdrawal) {
            return res.status(404).json({ message: 'Withdrawal not found' });
        }

        withdrawal.status = 'rejected';
        withdrawal.processedAt = new Date();
        await withdrawal.save();

        // Return amount to user's wallet
        await User.findByIdAndUpdate(withdrawal.user, {
            $inc: { wallet: withdrawal.amount }
        });

        res.json({ message: 'Withdrawal rejected successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error rejecting withdrawal' });
    }
};

// New function to get total points sent in shared capital
exports.getTotalPointsSentInSharedCapital = async (req, res) => {
    try {
        const totalPointsSent = await Investment.aggregate([
            {
                $match: { 
                    package: { $exists: true, $ne: null },
                    status: 'completed' // Only count completed investments
                }
            },
            {
                $group: {
                    _id: null,
                    totalPoints: { $sum: '$amount' }
                }
            }
        ]);

        // Handle case when there are no investments yet
        const total = totalPointsSent.length > 0 ? totalPointsSent[0].totalPoints : 0;
        
        res.json({ 
            success: true,
            totalPointsSent: total 
        });
    } catch (error) {
        console.error('Error getting total points sent in shared capital:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error getting total points sent in shared capital',
            error: error.message 
        });
    }
};

exports.approveSharedWithdrawal = async (req, res) => {
    try {
        const { id } = req.params;
        const withdrawal = await Withdrawal.findById(id).populate('agentId');
        if (!withdrawal) {
            return res.status(404).json({ message: 'Withdrawal not found' });
        }
        if (withdrawal.source === 'shared_capital') {
            const user = await User.findById(withdrawal.agentId._id);
            user.sharedEarnings = Math.max(0, (user.sharedEarnings || 0) - withdrawal.amount);
            await user.save();
        }
        // Create shared capital transaction record
        await SharedCapitalTransaction.create({
            user: withdrawal.agentId._id,
            type: 'withdrawal',
            amount: withdrawal.amount,
            package: `Package ${withdrawal.package || 1}`,
            status: 'completed',
            description: `Shared Capital withdrawal of ₱${withdrawal.amount.toLocaleString()} processed via ${withdrawal.method}`,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        withdrawal.status = 'completed';
        withdrawal.processedAt = new Date();
        await withdrawal.save();
        res.json({ message: 'Shared withdrawal approved successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error approving shared withdrawal' });
    }
};

exports.rejectSharedWithdrawal = async (req, res) => {
    try {
        const { id } = req.params;
        const withdrawal = await Withdrawal.findById(id).populate('agentId');
        if (!withdrawal) {
            return res.status(404).json({ message: 'Withdrawal not found' });
        }
        if (withdrawal.status !== 'pending') {
            return res.status(400).json({ message: 'Withdrawal is not in pending status' });
        }
        const user = await User.findById(withdrawal.agentId._id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        if (withdrawal.source === 'shared_capital') {
            user.sharedEarnings = (user.sharedEarnings || 0) + withdrawal.amount;
            await user.save();
        }
        withdrawal.status = 'rejected';
        withdrawal.processedAt = new Date();
        await withdrawal.save();
        res.json({ message: 'Withdrawal rejected and balance restored' });
    } catch (error) {
        res.status(500).json({ message: 'Error rejecting shared withdrawal' });
    }
};

exports.getSharedWithdrawals = async (req, res) => {
    try {
        console.log('Fetching all shared capital withdrawals...');
        const withdrawals = await Withdrawal.find({
            source: 'shared_capital'
        })
        .populate('agentId', 'username email')
        .sort({ createdAt: -1 });

        console.log('Found shared capital withdrawals:', withdrawals.length);
        if (withdrawals.length > 0) {
            console.log('Sample withdrawal:', JSON.stringify(withdrawals[0], null, 2));
            console.log('Sample agentId:', withdrawals[0].agentId);
        }
        res.json(withdrawals);
    } catch (error) {
        console.error('Get shared withdrawals error:', error);
        res.status(500).json({ message: 'Error fetching shared withdrawals' });
    }
};

exports.getSettings = async (req, res) => {
    try {
        let settings = await Settings.findOne();
        if (!settings) {
            settings = await Settings.create({
                clickReward: 1,
                referralBonus: 50,
                minimumWithdrawal: 500,
                sharedEarningPercentage: 0.5,
                paymentMethods: []
            });
        }
        res.json(settings);
    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({ message: 'Error fetching settings' });
    }
};

exports.updateSettings = async (req, res) => {
    try {
        const { clickReward, dailyClickCap, referralBonus, minimumWithdrawal, sharedEarningPercentage, sharedCapReferralRates, packages, paymentMethods } = req.body;
        
        // Validate payment methods
        if (paymentMethods && !Array.isArray(paymentMethods)) {
            return res.status(400).json({ message: 'Payment methods must be an array' });
        }

        // Ensure each payment method has required fields
        if (paymentMethods) {
            for (const method of paymentMethods) {
                if (!method.name || !method.accountName || !method.accountNumber) {
                    return res.status(400).json({ message: 'Each payment method must have a name, account name, and account number' });
                }
            }
        }

        // Update settings
        const settings = await Settings.findOneAndUpdate(
            {},
            {
                clickReward,
                dailyClickCap,
                referralBonus,
                minimumWithdrawal,
                sharedEarningPercentage,
                sharedCapReferralRates,
                packages,
                paymentMethods
            },
            { new: true, upsert: true }
        );

        res.json({
            message: 'Settings updated successfully',
            settings
        });
    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({ message: 'Error updating settings' });
    }
};

// Get pending investments
exports.getPendingInvestments = async (req, res) => {
    try {
        const pendingInvestments = await Investment.find({ status: 'pending' })
            .populate('user', 'username email')
            .sort({ createdAt: -1 });
        
        res.json(pendingInvestments);
    } catch (error) {
        console.error('Get pending investments error:', error);
        res.status(500).json({ message: 'Error fetching pending investments' });
    }
};

// Get shared capital transactions
exports.getSharedTransactions = async (req, res) => {
    try {
        const sharedTransactions = await SharedCapitalTransaction.find()
            .populate('user', 'username email')
            .sort({ createdAt: -1 });

        res.json(sharedTransactions);
    } catch (error) {
        console.error('Get shared transactions error:', error);
        res.status(500).json({ message: 'Error fetching shared transactions' });
    }
};

exports.approveInvestment = async (req, res) => {
    try {
        const { id } = req.params;
        const investment = await Investment.findByIdAndUpdate(
            id,
            { status: 'approved', approvedAt: new Date() },
            { new: true }
        ).populate('user', 'username email');

        if (!investment) {
            return res.status(404).json({ message: 'Investment not found' });
        }

        // Update user's wallet balance
        await User.findByIdAndUpdate(
            investment.user._id,
            { $inc: { wallet: investment.amount } }
        );

        res.json({
            message: 'Investment approved successfully',
            investment
        });
    } catch (error) {
        console.error('Approve investment error:', error);
        res.status(500).json({ message: 'Error approving investment' });
    }
};

exports.rejectInvestment = async (req, res) => {
    try {
        const { id } = req.params;
        const investment = await Investment.findByIdAndUpdate(
            id,
            { status: 'rejected', rejectedAt: new Date() },
            { new: true }
        ).populate('user', 'username email');

        if (!investment) {
            return res.status(404).json({ message: 'Investment not found' });
        }

        res.json({
            message: 'Investment rejected successfully',
            investment
        });
    } catch (error) {
        console.error('Reject investment error:', error);
        res.status(500).json({ message: 'Error rejecting investment' });
    }
};

exports.getPendingWithdrawals = async (req, res) => {
    try {
        const pendingWithdrawals = await Withdrawal.find({ status: 'pending' })
            .populate('agentId', 'username email')
            .sort({ createdAt: -1 });
        
        res.json(pendingWithdrawals);
    } catch (error) {
        console.error('Get pending withdrawals error:', error);
        res.status(500).json({ message: 'Error fetching pending withdrawals' });
    }
};

exports.approveWithdrawal = async (req, res) => {
    try {
        const { id } = req.params;
        const withdrawal = await Withdrawal.findByIdAndUpdate(
            id,
            { status: 'completed', processedAt: new Date() },
            { new: true }
        ).populate('agentId', 'username email');

        if (!withdrawal) {
            return res.status(404).json({ message: 'Withdrawal not found' });
        }

        // Deduct from user's wallet
        await User.findByIdAndUpdate(
            withdrawal.agentId._id,
            { $inc: { wallet: -withdrawal.amount } }
        );

        // Create a Transaction record for the withdrawal
        await Transaction.create({
            user: withdrawal.agentId._id,
            type: 'withdrawal',
            amount: withdrawal.amount,
            status: 'completed',
            withdrawal: withdrawal._id,
            description: `Withdrawal of ₱${withdrawal.amount} approved via ${withdrawal.method}`
        });

        res.json({
            message: 'Withdrawal approved successfully',
            withdrawal
        });
    } catch (error) {
        console.error('Approve withdrawal error:', error);
        res.status(500).json({ message: 'Error approving withdrawal' });
    }
};

exports.rejectWithdrawal = async (req, res) => {
    try {
        const { id } = req.params;
        // Find the withdrawal and populate agentId
        const withdrawal = await Withdrawal.findByIdAndUpdate(
            id,
            { status: 'rejected', rejectedAt: new Date() },
            { new: true }
        ).populate('agentId');

        if (!withdrawal) {
            return res.status(404).json({ message: 'Withdrawal not found' });
        }

        // Restore the amount to the agent's balance based on withdrawal type
        const user = await User.findById(withdrawal.agentId._id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Handle different withdrawal sources
        if (withdrawal.source === 'direct_indirect') {
            // For referral earnings
            if (!user.referralEarnings) {
                user.referralEarnings = { direct: 0, indirect: 0 };
            }
            // Split the amount evenly between direct and indirect
            const half = withdrawal.amount / 2;
            user.referralEarnings.direct = (user.referralEarnings.direct || 0) + half;
            user.referralEarnings.indirect = (user.referralEarnings.indirect || 0) + (withdrawal.amount - half);
        } else if (withdrawal.source === 'click_earnings') {
            // For click earnings
            user.clickEarnings = (user.clickEarnings || 0) + withdrawal.amount;
        } else if (withdrawal.source === 'shared_capital') {
            // For shared capital withdrawals
            user.sharedCapital = (user.sharedCapital || 0) + withdrawal.amount;
            
            // Create a transaction record for the returned funds
            const transaction = new Transaction({
                user: user._id,
                amount: withdrawal.amount,
                type: 'shared_capital_return',
                status: 'completed',
                description: `Returned rejected withdrawal (${withdrawal._id})`
            });
            await transaction.save();
        }

        await user.save();

        res.json({
            message: 'Withdrawal rejected and amount restored successfully',
            withdrawal
        });
    } catch (error) {
        console.error('Reject withdrawal error:', error);
        res.status(500).json({ message: 'Error rejecting withdrawal' });
    }
};

exports.getPendingRegistrations = async (req, res) => {
    try {
        const pendingRegistrations = await User.find({ 
            status: 'pending'
        })
        .populate('referrer', 'username')
        .select('-password')
        .sort({ createdAt: -1 });
        
        res.json(pendingRegistrations);
    } catch (error) {
        console.error('Get pending registrations error:', error);
        res.status(500).json({ message: 'Error fetching pending registrations' });
    }
};

exports.approveRegistration = async (req, res) => {
  try {
    const { id } = req.params;
    // Only update the necessary fields to avoid validation errors
    const result = await User.updateOne(
      { _id: id },
      { $set: { status: 'approved', isActive: true, approvedAt: new Date() } }
    );
    if (result.modifiedCount === 0 && result.nModified === 0) {
      return res.status(404).json({ message: 'User not found or not updated.' });
    }

    res.json({
      message: 'Registration approved successfully',
      userId: id
    });
  } catch (error) {
    console.error('Approve registration error:', error);
    res.status(500).json({ message: 'Error approving registration' });
  }
};

exports.rejectRegistration = async (req, res) => {
  try {
    const { id } = req.params;
    // Only update the necessary fields to avoid validation errors
    const result = await User.updateOne(
      { _id: id },
      { $set: { status: 'rejected', isActive: false, rejectedAt: new Date() } }
    );
    if (result.modifiedCount === 0 && result.nModified === 0) {
      return res.status(404).json({ message: 'User not found or not updated.' });
    }
    res.json({
      message: 'Registration rejected successfully',
      userId: id
    });
  } catch (error) {
    console.error('Reject registration error:', error);
    res.status(500).json({ message: 'Error rejecting registration' });
  }
};

const generateReferralCode = async () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const existingUser = await User.findOne({ referralCode: code });
    if (existingUser) {
        return generateReferralCode(); // Try again if code exists
    }
    return code;
};

exports.getReferralData = async (req, res) => {
    try {
        // Get admin's referral data
        const admin = await User.findById(req.user._id);
        
        // Generate referral code if missing
        if (!admin.referralCode) {
            admin.referralCode = await generateReferralCode();
            await admin.save();
        }
        
        // Get total referrals across the platform (all agent users)
        const totalReferrals = await User.countDocuments({ role: 'agent' });
        
        // Get active referrals (agents that are active and approved)
        const activeReferrals = await User.countDocuments({ 
            role: 'agent',
            isActive: true,
            status: 'approved'
        });

        // Calculate total commission from completed referral transactions
        const completedCommission = await Transaction.aggregate([
            {
                $match: {
                    user: req.user._id,
                    type: 'referral',
                    status: 'completed'
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$amount' }
                }
            }
        ]);



        res.json({
            referralCode: admin.referralCode,
            totalReferrals,
            activeReferrals,
            completedCommission: completedCommission[0]?.total || 0
        });
    } catch (error) {
        console.error('Get referral data error:', error);
        res.status(500).json({ message: 'Error fetching referral data' });
    }
};

exports.toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const newIsActive = !user.isActive;
    const newStatus = newIsActive ? 'approved' : 'pending';
    await User.updateOne(
      { _id: id },
      { $set: { isActive: newIsActive, status: newStatus } }
    );
    res.json({
      message: `User ${newIsActive ? 'activated' : 'deactivated'} successfully`,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        isActive: newIsActive,
        status: newStatus
      }
    });
  } catch (error) {
    console.error('Toggle user status error:', error);
    res.status(500).json({ message: 'Error toggling user status' });
  }
};

// Package requests management
exports.getPendingPackages = async (req, res) => {
  try {
    const packages = await Package.find({ status: 'pending' })
      .populate('user', 'name email')
      .sort({ createdAt: -1 });
    
    res.json(packages);
  } catch (error) {
    console.error('Error fetching pending packages:', error);
    res.status(500).json({ message: 'Error fetching pending packages' });
  }
};

exports.approvePackage = async (req, res) => {
  try {
    const package = await Package.findById(req.params.id);
    if (!package) {
      return res.status(404).json({ message: 'Package not found' });
    }

    if (package.status !== 'pending') {
      return res.status(400).json({ message: 'Package is not pending approval' });
    }

    // Update package status and dates
    package.status = 'active';
    package.startDate = new Date();
    package.endDate = new Date(Date.now() + package.duration * 24 * 60 * 60 * 1000);
    await package.save();

    // Update user's package
    const user = await User.findById(package.user);
    user.package = package._id;
    await user.save();

    res.json({ message: 'Package approved successfully', package });
  } catch (error) {
    console.error('Error approving package:', error);
    res.status(500).json({ message: 'Error approving package' });
  }
};

exports.rejectPackage = async (req, res) => {
  try {
    const package = await Package.findById(req.params.id);
    if (!package) {
      return res.status(404).json({ message: 'Package not found' });
    }

    if (package.status !== 'pending') {
      return res.status(400).json({ message: 'Package is not pending approval' });
    }

    // Update package status
    package.status = 'rejected';
    await package.save();

    res.json({ message: 'Package rejected successfully', package });
  } catch (error) {
    console.error('Error rejecting package:', error);
    res.status(500).json({ message: 'Error rejecting package' });
  }
};

// Get withdrawal statistics by source type
exports.getWithdrawalStats = async (req, res) => {
    try {
        // Get total withdrawals by source type
        const withdrawalsBySource = await Withdrawal.aggregate([
            {
                $match: { status: 'completed' }
            },
            {
                $group: {
                    _id: '$source',
                    total: { $sum: '$amount' }
                }
            }
        ]);

        // Get pending withdrawals by source type
        const pendingWithdrawalsBySource = await Withdrawal.aggregate([
            {
                $match: { status: 'pending' }
            },
            {
                $group: {
                    _id: '$source',
                    total: { $sum: '$amount' }
                }
            }
        ]);

        // Format the response
        const result = {
            totalWithdrawals: withdrawalsBySource.reduce((sum, item) => sum + item.total, 0),
            totalPending: pendingWithdrawalsBySource.reduce((sum, item) => sum + item.total, 0),
            referral: {
                total: withdrawalsBySource.find(item => item._id === 'referral_earnings')?.total || 0,
                pending: pendingWithdrawalsBySource.find(item => item._id === 'referral_earnings')?.total || 0
            },
            click: {
                total: withdrawalsBySource.find(item => item._id === 'click_earnings')?.total || 0,
                pending: pendingWithdrawalsBySource.find(item => item._id === 'click_earnings')?.total || 0
            },
            shared: {
                total: withdrawalsBySource.find(item => item._id === 'shared_capital')?.total || 0,
                pending: pendingWithdrawalsBySource.find(item => item._id === 'shared_capital')?.total || 0
            }
        };

        res.json(result);
    } catch (error) {
        console.error('Get withdrawal stats error:', error);
        res.status(500).json({ message: 'Error fetching withdrawal statistics' });
    }
};

// Fetch agent withdrawal requests by source (direct_indirect or click_earnings)
exports.getWithdrawalsBySource = async (req, res) => {
    try {
        const { source } = req.query;
        if (!source || !['direct_indirect', 'click_earnings'].includes(source)) {
            return res.status(400).json({ message: 'Invalid or missing source parameter' });
        }
        const withdrawals = await Withdrawal.find({ source })
            .populate('agentId', 'username email')
            .sort({ createdAt: -1 });
        res.json(withdrawals);
    } catch (error) {
        console.error('Error fetching withdrawals by source:', error);
        res.status(500).json({ message: 'Error fetching withdrawals by source' });
    }
};

// Admin reset user password
exports.adminResetUserPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }
    const salt = await require('bcryptjs').genSalt(10);
    const hashedPassword = await require('bcryptjs').hash(newPassword, salt);
    const result = await User.updateOne(
      { _id: id },
      { $set: { password: hashedPassword } }
    );
    if (result.modifiedCount === 0 && result.nModified === 0) {
      return res.status(404).json({ message: 'User not found or password not updated.' });
    }
    res.json({ message: 'Password reset successfully.' });
  } catch (error) {
    console.error('Admin reset user password error:', error);
    res.status(500).json({ message: 'Error resetting password' });
  }
};

// Permanently delete a user by ID
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await User.deleteOne({ _id: id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }
    res.json({ message: 'User deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting user.' });
  }
};
