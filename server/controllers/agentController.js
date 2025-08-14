const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Withdrawal = require('../models/Withdrawal');
const Agent = require('../models/Agent');
const Package = require('../models/Package');
const catchAsync = require('../utils/catchAsync');
const SharedCapitalTransaction = require('../models/sharedCapitalTransaction');
const mongoose = require('mongoose');

// Get agent's earnings and stats
exports.getEarnings = async (req, res) => {
    try {
        console.log('Calculating earnings for user:', req.user.username);
        const user = await User.findById(req.user._id);
        
        // Get all packages
        const packages = await Package.find({
            user: req.user._id,
            status: 'active'
        });
        
        console.log('Found packages:', packages.length);
        let sharedEarnings = 0;
        let pendingEarnings = 0;
        let immatureAmount = 0;
        let immaturePackages = 0;
        const now = new Date();

        // Calculate earnings for each package
        for (const pkg of packages) {
            const startDate = new Date(pkg.startDate);
            const endDate = new Date(pkg.endDate);
            const totalDays = pkg.packageType === 1 ? 12 : pkg.packageType === 2 ? 20 : 30;
            
            // Only include claimed packages in sharedEarnings
            if (pkg.claimed) {
                const totalEarnings = (pkg.amount || 0) + (pkg.totalEarnings || 0);
                sharedEarnings += totalEarnings;
            } else if (now >= endDate) {
                // Matured but not claimed
                const totalEarnings = (pkg.amount || 0) + (pkg.totalEarnings || 0);
                pendingEarnings += totalEarnings;
            } else {
                // Not matured - track amount but don't show in stats
                immatureAmount += pkg.amount;
                immaturePackages++;
            }
        }

        // Calculate actual available wallet balance (excluding immature amounts)
        const availableWallet = Math.max(0, (user.wallet || 0));

        console.log('Final earnings calculation:', {
            availableWallet,
            totalWallet: user.wallet,
            immatureAmount,
            immaturePackages,
            directReferral: user.referralEarnings?.direct || 0,
            indirectReferral: user.referralEarnings?.indirect || 0,
            totalClicks: user.clickEarnings || 0,
            sharedEarnings: sharedEarnings,
            pendingEarnings
        });

        res.json({
            wallet: availableWallet,
            directReferral: user.referralEarnings?.direct || 0,
            indirectReferral: user.referralEarnings?.indirect || 0,
            totalClicks: user.clickEarnings || 0,
            sharedEarnings: sharedEarnings,
            pendingEarnings: pendingEarnings,
            immaturePackages: immaturePackages,
            immatureAmount: immatureAmount,
            totalWithdraw: user.totalWithdraw || 0
        });
    } catch (error) {
        console.error('Error calculating earnings:', error);
        res.status(500).json({ message: 'Error calculating earnings' });
    }
};

// Get agent's downlines
exports.getDownlines = async (req, res) => {
    try {
        const userId = req.user._id;
        
        // Get direct downlines (level 1)
        const directDownlines = await User.find({ 
            referrer: userId
        })
            .select('username email referralCode createdAt wallet referralEarnings status isActive')
            .lean();

        // Get indirect downlines (level 2)
        const directDownlineIds = directDownlines.map(user => user._id);
        const indirectDownlines = await User.find({ 
            referrer: { $in: directDownlineIds }
        })
            .select('username email referralCode createdAt wallet referralEarnings referrer status isActive')
            .lean();

        // Add level information and format dates
        const formattedDirectDownlines = directDownlines.map(user => ({
            ...user,
            level: 1,
            createdAt: user.createdAt.toLocaleDateString(),
            totalEarnings: (user.wallet || 0) + 
                         (user.referralEarnings?.direct || 0) + 
                         (user.referralEarnings?.indirect || 0)
        }));

        const formattedIndirectDownlines = indirectDownlines.map(user => ({
            ...user,
            level: 2,
            createdAt: user.createdAt.toLocaleDateString(),
            totalEarnings: (user.wallet || 0) + 
                         (user.referralEarnings?.direct || 0) + 
                         (user.referralEarnings?.indirect || 0),
            upline: directDownlines.find(d => d._id.toString() === user.referrer.toString())?.username
        }));

        res.json({
            directDownlines: formattedDirectDownlines,
            indirectDownlines: formattedIndirectDownlines,
            stats: {
                totalDirectDownlines: formattedDirectDownlines.length,
                totalIndirectDownlines: formattedIndirectDownlines.length,
                totalDownlines: formattedDirectDownlines.length + formattedIndirectDownlines.length
            }
        });
    } catch (error) {
        console.error('Error fetching downlines:', error);
        res.status(500).json({ message: 'Error fetching downlines' });
    }
};

// Get agent's withdrawal history
exports.getWithdrawals = async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({ agentId: req.user._id })
      .sort({ createdAt: -1 });
    res.json(withdrawals);
  } catch (error) {
    console.error('Error fetching withdrawals:', error);
    res.status(500).json({ message: 'Failed to fetch withdrawal history' });
  }
};

// Submit withdrawal request
exports.submitWithdrawal = async (req, res) => {
  console.log('Starting withdrawal process...');
  try {
    const { amount, method, accountNumber, accountName, source } = req.body;
    const requestedAmount = parseFloat(amount);

    // Basic validation
    if (requestedAmount <= 0) {
      return res.status(400).json({ message: 'Invalid withdrawal amount' });
    }

    if (!['direct_indirect', 'click_earnings', 'shared_capital'].includes(source)) {
      return res.status(400).json({ message: 'Invalid withdrawal source' });
    }

    // Get user
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get all active and completed packages
    const packages = await Package.find({
      user: user._id,
      status: { $in: ['active', 'completed'] }
    });

    // Calculate available balance
    let availableBalance = 0;
    const now = new Date();

    if (source === 'shared_capital') {
      // Calculate earnings for each package
      for (const pkg of packages) {
        if (pkg.status === 'completed') {
          availableBalance += pkg.totalEarnings || 0;
          continue;
        }

        // For active packages
        const startDate = new Date(pkg.startDate);
        const daysSinceStart = Math.max(0, Math.floor((now - startDate) / (1000 * 60 * 60 * 24)));
        const currentEarnings = (pkg.dailyIncome || 0) * daysSinceStart;
        
        console.log(`Package ${pkg._id}:`, {
          amount: pkg.amount,
          dailyIncome: pkg.dailyIncome,
          days: daysSinceStart,
          earnings: currentEarnings
        });

        availableBalance += pkg.amount + currentEarnings;
      }
    } else if (source === 'direct_indirect') {
      console.log('DEBUG: Referral Earnings - direct:', user.referralEarnings?.direct, 'indirect:', user.referralEarnings?.indirect);
      availableBalance = (user.referralEarnings?.direct || 0) + (user.referralEarnings?.indirect || 0);
    } else if (source === 'click_earnings') {
      console.log('DEBUG: Click Earnings:', user.clickEarnings);
      availableBalance = user.clickEarnings || 0;
    } else if (source === 'shared_capital') {
      // Deduct from both pkg.totalEarnings and pkg.amount across all packages, in order
      let remainingAmount = requestedAmount;
      // Sort packages by createdAt ascending (oldest first)
      const sortedPackages = packages.sort((a, b) => a.createdAt - b.createdAt);
      for (const pkg of sortedPackages) {
        if (remainingAmount <= 0) break;
        // Deduct from totalEarnings first if available
        if (pkg.totalEarnings && pkg.totalEarnings > 0) {
          const deduction = Math.min(pkg.totalEarnings, remainingAmount);
          pkg.totalEarnings -= deduction;
          remainingAmount -= deduction;
        }
        // Then deduct from amount if still needed
        if (remainingAmount > 0 && pkg.amount && pkg.amount > 0) {
          const deduction = Math.min(pkg.amount, remainingAmount);
          pkg.amount -= deduction;
          remainingAmount -= deduction;
        }
        await pkg.save();
      }
      // Update total withdrawals for shared capital
      user.totalWithdraw = (user.totalWithdraw || 0) + requestedAmount;
      console.log('Updated total withdrawals:', {
        before: user.totalWithdraw - requestedAmount,
        added: requestedAmount,
        after: user.totalWithdraw
      });
    }

    console.log('DEBUG: Calculated availableBalance:', availableBalance);

    // Check if enough balance
    if (availableBalance < requestedAmount) {
      console.log('Insufficient balance:', { availableBalance, requestedAmount });
      return res.status(400).json({
        message: `Insufficient balance. Available: ₱${availableBalance.toLocaleString()}, Requested: ₱${requestedAmount.toLocaleString()}`
      });
    }

    // Create withdrawal record BEFORE deduction logic
    const withdrawal = new Withdrawal({
      agentId: req.user._id,
      amount: requestedAmount,
      method,
      accountNumber,
      accountName,
      source,
      status: 'pending'
    });
    await withdrawal.save();
    console.log('Withdrawal record created:', withdrawal);

    // After withdrawal creation and balance check
    if (source === 'direct_indirect') {
      let remainingAmount = requestedAmount;
      // Deduct from direct first
      if (user.referralEarnings.direct && user.referralEarnings.direct > 0) {
        const deduction = Math.min(user.referralEarnings.direct, remainingAmount);
        user.referralEarnings.direct -= deduction;
        remainingAmount -= deduction;
      }
      // Then deduct from indirect if needed
      if (remainingAmount > 0 && user.referralEarnings.indirect && user.referralEarnings.indirect > 0) {
        const deduction = Math.min(user.referralEarnings.indirect, remainingAmount);
        user.referralEarnings.indirect -= deduction;
        remainingAmount -= deduction;
      }
      user.wallet = Math.max(0, (user.wallet || 0) - requestedAmount); // Deduct from wallet
      user.totalWithdraw = (user.totalWithdraw || 0) + requestedAmount;
    } else if (source === 'click_earnings') {
      let remainingAmount = requestedAmount;
      if (user.clickEarnings && user.clickEarnings > 0) {
        const deduction = Math.min(user.clickEarnings, remainingAmount);
        user.clickEarnings -= deduction;
          remainingAmount -= deduction;
      }
      user.wallet = Math.max(0, (user.wallet || 0) - requestedAmount); // Deduct from wallet
      user.totalWithdraw = (user.totalWithdraw || 0) + requestedAmount;
    } else if (source === 'shared_capital') {
      let remainingAmount = requestedAmount;
      // Deduct from both pkg.totalEarnings and pkg.amount across all claimed packages, in order
      const claimedPackages = packages.filter(pkg => pkg.claimed).sort((a, b) => a.createdAt - b.createdAt);
      for (const pkg of claimedPackages) {
        if (remainingAmount <= 0) break;
        // Deduct from totalEarnings first if available
        if (pkg.totalEarnings && pkg.totalEarnings > 0) {
          const deduction = Math.min(pkg.totalEarnings, remainingAmount);
          pkg.totalEarnings -= deduction;
          remainingAmount -= deduction;
        }
        // Then deduct from amount if still needed
        if (remainingAmount > 0 && pkg.amount && pkg.amount > 0) {
          const deduction = Math.min(pkg.amount, remainingAmount);
          pkg.amount -= deduction;
            remainingAmount -= deduction;
        }
        await pkg.save();
      }
      user.totalWithdraw = (user.totalWithdraw || 0) + requestedAmount;
      console.log('Updated total withdrawals (shared capital):', {
        before: user.totalWithdraw - requestedAmount,
        added: requestedAmount,
        after: user.totalWithdraw
      });
    }

    await user.save();

    res.status(201).json(withdrawal);
} catch (error) {
    console.error('Error in submitWithdrawal:', error);
    res.status(500).json({
    message: 'Failed to process withdrawal request',
    error: error.message
    });
}
};

// Record a click and update earnings
exports.recordClick = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if clicking task is activated
        if (!user.clickingTaskActivated) {
            return res.status(403).json({ 
                message: 'Clicking task is not activated. You need ₱100 balance to activate it.',
                requiresActivation: true
            });
        }

        // Ensure dailyClicks is a number
        if (typeof user.dailyClicks !== 'number') {
          user.dailyClicks = 0;
        }

        // Check if daily limit is reached
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const lastClick = user.lastClick ? new Date(user.lastClick) : null;
        const isNewDay = !lastClick || lastClick < today;

        // Reset daily clicks if it's a new day
        if (isNewDay) {
            user.dailyClicks = 0;
            user.dailyClickEarnings = 0;
        }

        // Check if daily limit is reached (₱10 = 50 clicks)
        if (user.dailyClickEarnings >= 10) {
            return res.status(200).json({ 
                message: 'Daily Click Limit Reached',
                clicks: user.dailyClicks,
                clicks: (typeof user.dailyClicks === 'object' ? user.dailyClicks.count : user.dailyClicks),
                dailyEarnings: user.dailyClickEarnings,
                totalEarnings: user.clickEarnings
            });
        }

        // Calculate earnings for this click
        const clickEarning = 0.20;
        const newDailyEarnings = (user.dailyClickEarnings || 0) + clickEarning;

        // Check if this click would exceed the daily limit
        if (newDailyEarnings > 10) {
            return res.status(200).json({ 
                message: 'Daily Click Limit Reached',
                clicks: (typeof user.dailyClicks === 'object' ? user.dailyClicks.count : user.dailyClicks),
                dailyEarnings: user.dailyClickEarnings,
                totalEarnings: user.clickEarnings
            });
        }

        // Update click counts and earnings
        const currentClicks = typeof user.dailyClicks === 'number' ? user.dailyClicks : 0;
        user.dailyClicks = currentClicks + 1;
        user.dailyClickEarnings = newDailyEarnings;
        user.clickEarnings = (user.clickEarnings || 0) + clickEarning;
        user.lastClick = new Date();

        await user.save();

        res.json({
            message: 'Click recorded successfully',
            clicks: (typeof user.dailyClicks === 'object' ? user.dailyClicks.count : user.dailyClicks),
            dailyEarnings: user.dailyClickEarnings,
            totalEarnings: user.clickEarnings
        });
    } catch (error) {
        console.error('Error recording click:', error);
        res.status(500).json({ message: 'Error recording click' });
    }
};

// Activate clicking task
exports.activateClickingTask = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if clicking task is already activated
        if (user.clickingTaskActivated) {
            return res.status(400).json({ 
                message: 'Clicking task is already activated' 
            });
        }

        // Check if user has sufficient balance (₱100)
        if (user.wallet < 100) {
            return res.status(400).json({ 
                message: 'Insufficient balance. You need ₱100 to activate the clicking task.',
                requiredBalance: 100,
                currentBalance: user.wallet
            });
        }

        // Deduct ₱100 from wallet and activate clicking task
        user.wallet -= 100;
        user.clickingTaskActivated = true;
        user.clickingTaskActivatedAt = new Date();

        // Create transaction record
        await Transaction.create({
            user: user._id,
            type: 'clicking_task_activation',
            amount: -100,
            description: 'Clicking task activation fee',
            status: 'completed'
        });

        await user.save();

        // Process referral bonuses
        console.log('Processing referral bonuses for user:', user.username);
        await processReferralBonuses(user);

        res.json({
            message: 'Clicking task activated successfully',
            newBalance: user.wallet,
            clickingTaskActivated: true
        });
    } catch (error) {
        console.error('Error activating clicking task:', error);
        res.status(500).json({ message: 'Error activating clicking task' });
    }
};

// Process referral bonuses when clicking task is activated
const processReferralBonuses = async (user) => {
    try {
        if (!user.referrer) {
            return; // No referrer, no bonuses to process
        }

        // Find the direct referrer (Level 1)
        const directReferrer = await User.findById(user.referrer);
        if (!directReferrer) {
            return; // Direct referrer not found
        }

        // Give ₱10 direct referral bonus to the direct referrer ONLY
        const directBonusAmount = 10;
        
        // Update direct referrer's direct referral earnings
        if (!directReferrer.referralEarnings) {
            directReferrer.referralEarnings = { direct: 0, indirect: 0 };
        }
        
        console.log('Before updating direct referrer earnings:', {
            username: directReferrer.username,
            directBefore: directReferrer.referralEarnings.direct,
            indirectBefore: directReferrer.referralEarnings.indirect
        });
        
        directReferrer.referralEarnings.direct += directBonusAmount;
        
        console.log('After updating direct referrer earnings:', {
            username: directReferrer.username,
            directAfter: directReferrer.referralEarnings.direct,
            indirectAfter: directReferrer.referralEarnings.indirect,
            bonusAdded: directBonusAmount
        });

        // Create transaction record for direct referral
        await Transaction.create({
            user: directReferrer._id,
            type: 'referral',
            amount: directBonusAmount,
            referralType: 'direct',
            description: 'Direct referral bonus from clicking task activation',
            status: 'completed',
            relatedUser: user._id
        });

        await directReferrer.save();

        console.log('Referral bonus processed successfully:', {
            user: user.username,
            directReferrer: directReferrer.username,
            directBonus: directBonusAmount,
            note: 'Only direct referral bonus given for clicking task activation'
        });

    } catch (error) {
        console.error('Error processing referral bonuses:', error);
        throw error; // Re-throw to handle in calling function
    }
};

exports.getAgentStats = catchAsync(async (req, res) => {
  // Get the agent's ID from the authenticated user
  const agentId = req.user._id;

  // Get total downlines (users who have this agent as their referrer)
  const totalDownlines = await User.countDocuments({ referrer: agentId });

  // Get total earnings from transactions
  const earningsResult = await Transaction.aggregate([
    {
      $match: {
        agent: agentId,
        type: 'commission',
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

  // Get active investments count
  const activeInvestments = await Transaction.countDocuments({
    agent: agentId,
    type: 'investment',
    status: 'active'
  });

  // Get total transactions count
  const totalTransactions = await Transaction.countDocuments({
    agent: agentId
  });

  res.status(200).json({
    totalDownlines,
    totalEarnings: earningsResult[0]?.total || 0,
    activeInvestments,
    totalTransactions
  });
});

exports.getTeamMembers = catchAsync(async (req, res) => {
  const agentId = req.user._id;

  const teamMembers = await User.find({ referrer: agentId })
    .select('username email createdAt')
    .sort('-createdAt');

  const formattedTeamMembers = teamMembers.map(member => ({
    name: member.username,
    email: member.email,
    joinedDate: member.createdAt
  }));

  res.status(200).json(formattedTeamMembers);
});

exports.claimMaturedPackage = async (req, res) => {
  try {
    const { packageId } = req.body;
    const userId = req.user._id;

    // Find the package
    const pkg = await Package.findOne({ _id: packageId, user: userId, status: 'active' });
    if (!pkg) {
      return res.status(404).json({ message: 'Package not found or not active.' });
    }

    // Check if matured
    const now = new Date();
    if (now < pkg.endDate) {
      return res.status(400).json({ message: 'Package has not matured yet.' });
    }

    // Calculate final earnings
    const packageConfig = {
      1: { rate: 0.20, duration: 12 },
      2: { rate: 0.50, duration: 20 }
    }[pkg.packageType];

    // Calculate total earnings (principal + profit)
    const profitAmount = pkg.amount * packageConfig.rate;
    const totalAmount = pkg.amount + profitAmount;

    // Update user sharedEarnings (not wallet)
    const user = await User.findById(userId);
    user.sharedEarnings = (user.sharedEarnings || 0) + totalAmount;
    await user.save();

    // Mark package as completed with final earnings
    pkg.status = 'completed';
    pkg.totalEarnings = totalAmount; // Store the total amount as earnings for completed packages
    await pkg.save();

    res.json({ message: 'Earnings claimed successfully!', totalEarnings });
  } catch (error) {
    console.error('Error claiming earnings:', error);
    res.status(500).json({ message: 'Error claiming earnings' });
  }
};

// Get agent's profile
exports.getProfile = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId)
            .select('username email referralCode wallet referralEarnings')
            .lean();

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json(user);
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({ message: 'Error fetching profile' });
    }
};

// Update package earnings and process matured packages
exports.updatePackageEarnings = async (req, res) => {
    try {
        const now = new Date();
        
        // Find all active packages that haven't matured yet
        const activePackages = await Package.find({
            status: 'active',
            endDate: { $gt: now },
            $or: [
                { claimed: { $exists: false } },
                { claimed: false }
            ]
        });
        
        let updatedCount = 0;
        
        for (const pkg of activePackages) {
            // Calculate days since last update (minimum 1 day)
            const lastUpdate = pkg.lastUpdated || pkg.startDate;
            const daysSinceUpdate = Math.max(1, Math.floor((now - lastUpdate) / (1000 * 60 * 60 * 24)));
            
            // Calculate maximum possible earnings based on package duration
            const totalDays = pkg.packageType === 1 ? 12 : pkg.packageType === 2 ? 20 : 30;
            const maxEarnings = pkg.dailyIncome * totalDays;
            const potentialEarnings = pkg.dailyIncome * daysSinceUpdate;
            
            // Ensure we don't exceed maximum earnings
            const newEarnings = Math.min(
                potentialEarnings,
                maxEarnings - (pkg.totalEarnings || 0)
            );
            
            if (newEarnings > 0) {
                // Update package with atomic operation
                await Package.findByIdAndUpdate(pkg._id, {
                    $inc: { totalEarnings: parseFloat(newEarnings.toFixed(2)) },
                    lastUpdated: now
                });
                
                updatedCount++;
            }
        }
        
        // Process matured packages
        await processMaturedPackages();
        
        if (res) {
            res.json({
                success: true,
                message: `Updated earnings for ${updatedCount} packages`,
                updatedCount,
                timestamp: now
            });
        }
    } catch (error) {
        console.error('Error updating package earnings:', error);
        if (res) {
            res.status(500).json({ 
                success: false,
                message: 'Error updating package earnings',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
};

// Helper function to process matured packages
async function processMaturedPackages() {
    try {
        const now = new Date();
        
        // Find packages that have matured but haven't been processed
        const maturedPackages = await Package.find({
            status: 'active',
            endDate: { $lte: now },
            $or: [
                { claimed: { $exists: false } },
                { claimed: false }
            ]
        });
        
        for (const pkg of maturedPackages) {
            try {
                // Ensure we have the latest package data
                const freshPkg = await Package.findById(pkg._id);
                if (!freshPkg || freshPkg.claimed) continue;
                
                // Calculate final earnings
                const totalDays = freshPkg.packageType === 1 ? 12 : freshPkg.packageType === 2 ? 20 : 30;
                const totalEarned = freshPkg.dailyIncome * totalDays;
                
                // Mark as matured but not claimed
                freshPkg.status = 'completed';
                freshPkg.totalEarnings = totalEarned;
                freshPkg.lastUpdated = now;
                
                await freshPkg.save();
                
                console.log(`Marked package ${freshPkg._id} as matured`);
            } catch (pkgError) {
                console.error(`Error processing package ${pkg._id}:`, pkgError);
                // Continue with next package even if one fails
            }
        }
        
        return {
            success: true,
            processed: maturedPackages.length,
            timestamp: now
        };
    } catch (error) {
        console.error('Error in processMaturedPackages:', error);
        throw error;
    }
}

// Add new endpoint to claim matured package
exports.claimPackage = async (req, res) => {
    try {
        const { packageId } = req.body;
        const now = new Date();

        console.log('Claim package request:', { packageId, userId: req.user._id });

        if (!packageId) {
            return res.status(400).json({ message: 'Package ID is required' });
        }

        // Find the package
        const pkg = await Package.findOne({
            _id: packageId,
            user: req.user._id,
            status: 'active'
        });

        console.log('Found package:', pkg ? { 
            _id: pkg._id, 
            packageType: pkg.packageType, 
            amount: pkg.amount, 
            claimed: pkg.claimed,
            endDate: pkg.endDate 
        } : 'Package not found');

        if (!pkg) {
            return res.status(404).json({ message: 'Package not found or already claimed' });
        }

        const endDate = new Date(pkg.endDate);
        if (now < endDate) {
            return res.status(400).json({ 
                message: 'Package has not matured yet',
                maturityDate: endDate
            });
        }

        if (pkg.claimed) {
            return res.status(400).json({ message: 'Package has already been claimed' });
        }

        // Calculate total earnings = principal + interest
        const totalDays = pkg.packageType === 1 ? 12 : pkg.packageType === 2 ? 20 : 30;
        let interestEarned, totalEarnings;
        
        if (pkg.packageType === 1) {
            // Package 1: Scale based on investment amount
            // Base: ₱100 → ₱20 profit → ₱120 total return
            const baseAmount = 100;
            const baseProfit = 20;
            const baseTotal = 120;
            const multiplier = pkg.amount / baseAmount;
            
            interestEarned = parseFloat((baseProfit * multiplier).toFixed(2));
            totalEarnings = parseFloat((baseTotal * multiplier).toFixed(2));
        } else if (pkg.packageType === 2) {
            // Package 2: Scale based on investment amount
            // Base: ₱500 → ₱250 profit → ₱750 total return
            const baseAmount = 500;
            const baseProfit = 250;
            const baseTotal = 750;
            const multiplier = pkg.amount / baseAmount;
            
            interestEarned = parseFloat((baseProfit * multiplier).toFixed(2));
            totalEarnings = parseFloat((baseTotal * multiplier).toFixed(2));
        } else if (pkg.packageType === 3) {
            // Package 3: Scale based on investment amount
            // Base: ₱1000 → ₱2000 profit → ₱3000 total return
            const baseAmount = 1000;
            const baseProfit = 2000;
            const baseTotal = 3000;
            const multiplier = pkg.amount / baseAmount;
            
            interestEarned = parseFloat((baseProfit * multiplier).toFixed(2));
            totalEarnings = parseFloat((baseTotal * multiplier).toFixed(2));
        }

        // Get user
        const user = await User.findById(req.user._id);
        console.log('Found user:', user ? { 
            _id: user._id, 
            sharedEarnings: user.sharedEarnings 
        } : 'User not found');
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Update package status
        pkg.claimed = true;
        pkg.claimedAt = now;
        await pkg.save();
        console.log('Package updated successfully');

        // Credit principal + interest to Shared Capital Earnings
        const oldSharedEarnings = user.sharedEarnings || 0;
        user.sharedEarnings = parseFloat(((user.sharedEarnings || 0) + totalEarnings).toFixed(2));
        console.log('Updating user sharedEarnings:', { 
            old: oldSharedEarnings, 
            new: user.sharedEarnings, 
            added: totalEarnings 
        });
        await user.save();
        console.log('User updated successfully');

        // Create transaction record
        const transaction = new SharedCapitalTransaction({
            user: req.user._id,
            type: 'earning',
            amount: totalEarnings,
            package: `Package ${pkg.packageType}`,
            status: 'completed',
            description: `Claimed Package ${pkg.packageType}: principal ₱${pkg.amount.toLocaleString()} + interest ₱${interestEarned.toLocaleString()}`,
            createdAt: now
        });
        console.log('Creating transaction:', { 
            user: req.user._id, 
            amount: totalEarnings, 
            package: `Package ${pkg.packageType}` 
        });
        await transaction.save();
        console.log('Transaction created successfully');

        // Notify via WebSocket (outside transaction)
        try {
            if (global.io) {
                global.io.emit('earnings_update', {
                    type: 'earnings_update',
                    agentId: req.user._id,
                    earnings: { total: totalEarnings }
                });
            }
        } catch (wsError) {
            console.error('WebSocket notification error:', wsError);
            // Don't fail the request if WebSocket notification fails
        }

        const response = {
            success: true,
            message: 'Package claimed successfully',
            total: totalEarnings,
            principal: pkg.amount,
            interest: interestEarned,
            packageType: pkg.packageType,
            claimDate: now
        };
        
        console.log('Claim package success:', response);
        res.json(response);
    } catch (error) {
        console.error('Error claiming package:', error);
        console.error('Error stack:', error.stack);

        // More specific error messages
        if (error.name === 'ValidationError') {
            return res.status(400).json({ 
                success: false,
                message: 'Validation error',
                error: error.message 
            });
        }

        if (error.name === 'CastError') {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid package ID format',
                error: error.message 
            });
        }

        res.status(500).json({ 
            success: false,
            message: 'Failed to claim package',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};



// Change password
exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user._id;

        // Find user by ID
        const user = await User.findById(userId).select('+password');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Verify current password
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Current password is incorrect' });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // Update password
        user.password = hashedPassword;
        await user.save();

        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error('Error changing password:', error);
        res.status(500).json({ message: 'Error changing password' });
    }
};

// Get active and matured (but unclaimed) packages
exports.getActivePackages = async (req, res) => {
    try {
        // Get all packages that are either active or matured but not claimed
        const packages = await Package.find({
            user: req.user._id,
            status: 'active',
            $or: [
                { claimed: { $exists: false } },  // Not claimed (legacy support)
                { claimed: false }                // Explicitly not claimed
            ]
        });
        
        console.log('Found packages:', packages.map(p => ({
            _id: p._id,
            packageType: p.packageType,
            status: p.status,
            claimed: p.claimed,
            endDate: p.endDate,
            isMatured: new Date() >= new Date(p.endDate)
        })));

        const now = new Date();
        const formattedPackages = packages.map(pkg => {
            // Debug logging for packages with potential date issues
            if (!pkg.startDate || !pkg.endDate) {
                console.error('Package with missing dates:', {
                    _id: pkg._id,
                    startDate: pkg.startDate,
                    endDate: pkg.endDate,
                    packageType: pkg.packageType
                });
            }
            
            const startDate = new Date(pkg.startDate);
            const endDate = new Date(pkg.endDate);
            
            // Check if dates are valid
            let daysSinceStart, totalDays, daysRemaining, isMatured;
            
            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                console.error('Package with invalid dates:', {
                    _id: pkg._id,
                    startDate: pkg.startDate,
                    endDate: pkg.endDate,
                    packageType: pkg.packageType
                });
                // Set default values for invalid dates
                const defaultStartDate = new Date();
                const defaultEndDate = new Date();
                defaultEndDate.setDate(defaultEndDate.getDate() + (pkg.packageType === 1 ? 12 : pkg.packageType === 2 ? 20 : 30));
                
                daysSinceStart = Math.floor((now - defaultStartDate) / (1000 * 60 * 60 * 24));
                totalDays = pkg.packageType === 1 ? 12 : pkg.packageType === 2 ? 20 : 30;
                daysRemaining = Math.max(0, totalDays - daysSinceStart);
                isMatured = now >= defaultEndDate;
            } else {
                daysSinceStart = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
                totalDays = pkg.packageType === 1 ? 12 : pkg.packageType === 2 ? 20 : 30;
                daysRemaining = Math.max(0, totalDays - daysSinceStart);
                isMatured = now >= endDate;
            }

            // Ensure all packages show correct daily income and total earnings
            let displayDailyIncome = pkg.dailyIncome;
            let totalEarnings = 0;
            if (pkg.packageType === 1) {
                // Package 1: Scale based on investment amount
                // Base: ₱100 → ₱1.667 daily → ₱120 total return
                const baseAmount = 100;
                const baseDaily = 1.667;
                const baseTotal = 120;
                const multiplier = pkg.amount / baseAmount;
                displayDailyIncome = baseDaily * multiplier;
                if (isMatured) {
                    totalEarnings = baseTotal * multiplier;
                } else {
                    totalEarnings = displayDailyIncome * (totalDays - daysRemaining);
                }
            } else if (pkg.packageType === 2) {
                // Package 2: Scale based on investment amount
                // Base: ₱500 → ₱12.5 daily → ₱750 total return
                const baseAmount = 500;
                const baseDaily = 12.5;
                const baseTotal = 750;
                const multiplier = pkg.amount / baseAmount;
                displayDailyIncome = baseDaily * multiplier;
                if (isMatured) {
                    totalEarnings = baseTotal * multiplier;
                } else {
                    totalEarnings = displayDailyIncome * (totalDays - daysRemaining);
                }
            } else if (pkg.packageType === 3) {
                // Package 3: Scale based on investment amount
                // Base: ₱1000 → ₱100 daily → ₱3000 total return
                const baseAmount = 1000;
                const baseDaily = 100;
                const baseTotal = 3000;
                const multiplier = pkg.amount / baseAmount;
                displayDailyIncome = baseDaily * multiplier;
                if (isMatured) {
                    totalEarnings = baseTotal * multiplier;
                } else {
                    totalEarnings = displayDailyIncome * (totalDays - daysRemaining);
                }
            }

            return {
                _id: pkg._id,
                packageType: pkg.packageType,
                amount: pkg.amount,
                status: pkg.status,
                startDate: pkg.startDate,
                endDate: pkg.endDate,
                dailyIncome: displayDailyIncome,
                daysRemaining,
                totalDays,
                isMatured,
                totalEarnings: totalEarnings,
                claimed: pkg.claimed
            };
        });

        res.json(formattedPackages);
    } catch (error) {
        console.error('Error fetching active packages:', error);
        res.status(500).json({ message: 'Error fetching active packages' });
    }
};
