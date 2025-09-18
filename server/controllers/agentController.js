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
            // For claimed packages, totalEarnings already includes the principal
            const totalEarnings = pkg.totalEarnings || 0;
            sharedEarnings += totalEarnings;
            
            console.log('Claimed package earnings:', {
                packageId: pkg._id,
                packageType: pkg.packageType,
                amount: pkg.amount,
                totalEarnings: pkg.totalEarnings,
                addedToSharedEarnings: totalEarnings,
                runningTotal: sharedEarnings
            });
            
            // Validate that totalEarnings makes sense
            if (totalEarnings <= pkg.amount) {
                console.warn('Package has suspicious totalEarnings:', {
                    packageId: pkg._id,
                    amount: pkg.amount,
                    totalEarnings: totalEarnings,
                    expectedMin: pkg.amount * 1.2 // Should be at least 20% more than investment
                });
            }
        } else if (now >= endDate) {
                // Matured but not claimed - calculate potential earnings
                const totalDays = pkg.packageType === 1 ? 12 : pkg.packageType === 2 ? 20 : pkg.packageType === 3 ? 30 : 40;
                let potentialEarnings;
                
                if (pkg.packageType === 1) {
                    const baseAmount = 100;
                    const baseTotal = 120;
                    const multiplier = pkg.amount / baseAmount;
                    potentialEarnings = baseTotal * multiplier;
                } else if (pkg.packageType === 2) {
                    const baseAmount = 500;
                    const baseTotal = 750;
                    const multiplier = pkg.amount / baseAmount;
                    potentialEarnings = baseTotal * multiplier;
                } else if (pkg.packageType === 3) {
                    const baseAmount = 1000;
                    const baseTotal = 3000;
                    const multiplier = pkg.amount / baseAmount;
                    potentialEarnings = baseTotal * multiplier;
                } else if (pkg.packageType === 4) {
                    // For Package 4, fixed earnings amount of 1250 per partial claim
                    potentialEarnings = 1250;
                } else {
                    potentialEarnings = 0;
                }
                
                pendingEarnings += potentialEarnings;
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
            pendingEarnings,
            packagesCount: packages.length,
            claimedPackages: packages.filter(p => p.claimed).length,
            maturedUnclaimed: packages.filter(p => !p.claimed && now >= new Date(p.endDate)).length,
            userSharedEarnings: user.sharedEarnings || 0
        });
        
        console.log('Shared Capital Earnings breakdown:', {
            calculatedFromPackages: sharedEarnings,
            userFieldValue: user.sharedEarnings || 0,
            difference: sharedEarnings - (user.sharedEarnings || 0)
        });
        
        // If there's a significant discrepancy, log a warning
        const discrepancy = Math.abs(sharedEarnings - (user.sharedEarnings || 0));
        if (discrepancy > 1000) { // More than ₱1000 difference
            console.warn('LARGE DISCREPANCY DETECTED:', {
                calculatedFromPackages: sharedEarnings,
                userFieldValue: user.sharedEarnings || 0,
                difference: discrepancy,
                percentage: ((discrepancy / (user.sharedEarnings || 1)) * 100).toFixed(2) + '%'
            });
        }

        // Use the user's stored sharedEarnings value, but log any discrepancies
        const finalSharedEarnings = user.sharedEarnings || 0;
        
        res.json({
            wallet: availableWallet,
            directReferral: user.referralEarnings?.direct || 0,
            indirectReferral: user.referralEarnings?.indirect || 0,
            totalClicks: user.clickEarnings || 0,
            sharedEarnings: finalSharedEarnings, // Use stored value
            pendingEarnings: pendingEarnings,
            immaturePackages: immaturePackages,
            immatureAmount: immatureAmount,
            totalWithdraw: user.totalWithdraw || 0,
            // Include calculated value for debugging
            calculatedSharedEarnings: sharedEarnings,
            discrepancy: finalSharedEarnings - sharedEarnings
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

    // Find the package (can be active or completed but unclaimed)
    const pkg = await Package.findOne({ 
      _id: packageId, 
      user: userId, 
      $or: [
        { status: 'active' },
        { status: 'completed' }
      ]
    });
    if (!pkg) {
      return res.status(404).json({ message: 'Package not found or not available.' });
    }

    // Validate package data
    if (!pkg.amount || !pkg.packageType || !pkg.endDate) {
      console.error('Invalid package data:', pkg);
      return res.status(400).json({ message: 'Invalid package data' });
    }

    // Check if matured
    const now = new Date();
    if (now < pkg.endDate) {
      return res.status(400).json({ message: 'Package has not matured yet.' });
    }

    // Check if already claimed
    if (pkg.claimed) {
      return res.status(400).json({ message: 'Package has already been claimed.' });
    }

    // Calculate final earnings based on dashboard calculation
    let totalAmount;
    let profitAmount;
    
    if (pkg.packageType === 1) {
      // Package 1: Scale based on investment amount
      // Base: ₱100 → ₱120 total return (20% profit)
      const baseAmount = 100;
      const baseTotal = 120;
      const multiplier = pkg.amount / baseAmount;
      totalAmount = parseFloat((baseTotal * multiplier).toFixed(2));
      profitAmount = totalAmount - pkg.amount;
    } else if (pkg.packageType === 2) {
      // Package 2: Scale based on investment amount
      // Base: ₱500 → ₱750 total return (50% profit)
      const baseAmount = 500;
      const baseTotal = 750;
      const multiplier = pkg.amount / baseAmount;
      totalAmount = parseFloat((baseTotal * multiplier).toFixed(2));
      profitAmount = totalAmount - pkg.amount;
    } else if (pkg.packageType === 3) {
      // Package 3: Scale based on investment amount
      // Base: ₱1000 → ₱3000 total return (200% profit)
      const baseAmount = 1000;
      const baseTotal = 3000;
      const multiplier = pkg.amount / baseAmount;
      totalAmount = parseFloat((baseTotal * multiplier).toFixed(2));
      profitAmount = totalAmount - pkg.amount;
    } else {
      return res.status(400).json({ message: 'Invalid package type.' });
    }

    console.log('Earnings calculation:', {
      packageType: pkg.packageType,
      investment: pkg.amount,
      profit: profitAmount,
      total: totalAmount,
      baseAmount: pkg.packageType === 1 ? 100 : pkg.packageType === 2 ? 500 : 1000,
      baseTotal: pkg.packageType === 1 ? 120 : pkg.packageType === 2 ? 750 : 3000,
      multiplier: pkg.amount / (pkg.packageType === 1 ? 100 : pkg.packageType === 2 ? 500 : 1000)
    });

    // Get current user data to access sharedEarnings
    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Validate the calculation results
    if (isNaN(totalAmount) || isNaN(profitAmount) || totalAmount <= 0) {
      console.error('Invalid calculation results:', { totalAmount, profitAmount, packageType: pkg.packageType, amount: pkg.amount });
      return res.status(400).json({ message: 'Error calculating package earnings' });
    }
    
    // Update user sharedEarnings (not wallet) using atomic operation
    const oldSharedEarnings = currentUser.sharedEarnings || 0;
    const newSharedEarnings = parseFloat((oldSharedEarnings + totalAmount).toFixed(2));
    
    console.log('Updating user sharedEarnings:', {
      userId: userId,
      oldBalance: oldSharedEarnings,
      addedAmount: totalAmount,
      newBalance: newSharedEarnings,
      calculation: `${oldSharedEarnings} + ${totalAmount} = ${newSharedEarnings}`
    });
    
    // Use atomic update to avoid race conditions
    const updateResult = await User.findByIdAndUpdate(
      userId,
      { $set: { sharedEarnings: newSharedEarnings } },
      { new: true }
    );
    
    if (!updateResult) {
      throw new Error('Failed to update user sharedEarnings');
    }
    
    console.log('User sharedEarnings updated successfully via atomic operation');
    console.log('Verification - User sharedEarnings after atomic update:', {
      userId: userId,
      sharedEarnings: updateResult.sharedEarnings,
      expectedValue: newSharedEarnings,
      actualValue: updateResult.sharedEarnings,
      match: updateResult.sharedEarnings === newSharedEarnings
    });
    
    // Double-check by fetching the user again
    const verificationUser = await User.findById(userId);
    console.log('Double verification - User fetched after update:', {
      userId: userId,
      sharedEarnings: verificationUser.sharedEarnings,
      expectedValue: newSharedEarnings,
      actualValue: verificationUser.sharedEarnings,
      match: verificationUser.sharedEarnings === newSharedEarnings
    });
    
    // Also check the raw database value
    const rawUser = await User.findById(userId).lean();
    console.log('Raw database values:', {
      userId: userId,
      sharedEarnings: rawUser.sharedEarnings,
      sharedEarningsType: typeof rawUser.sharedEarnings,
      allFields: Object.keys(rawUser).filter(key => key.includes('shared') || key.includes('earnings'))
    });

    // Mark package as completed with final earnings
    pkg.status = 'completed';
    pkg.totalEarnings = totalAmount; // Store the total amount as earnings for completed packages
    pkg.claimed = true;
    pkg.claimedAt = now;
    
    const packageUpdateResult = await pkg.save();
    if (!packageUpdateResult) {
      throw new Error('Failed to update package status');
    }
    
    console.log('Package updated successfully:', {
      packageId: pkg._id,
      status: pkg.status,
      claimed: pkg.claimed,
      totalEarnings: pkg.totalEarnings
    });

    // Create transaction record
    try {
      const transaction = new SharedCapitalTransaction({
        user: userId,
        type: 'earning',
        amount: totalAmount,
        package: `Package ${pkg.packageType}`,
        status: 'completed',
        description: `Claimed Package ${pkg.packageType}: principal ₱${pkg.amount.toLocaleString()} + profit ₱${profitAmount.toLocaleString()}`
      });
      await transaction.save();
      console.log('Transaction created successfully');
    } catch (transactionError) {
      console.error('Error creating transaction:', transactionError);
      // Don't fail the request if transaction creation fails
    }

    const response = {
      success: true,
      message: 'Earnings claimed successfully!',
      totalEarnings: totalAmount,
      packageType: pkg.packageType,
      investment: pkg.amount,
      profit: profitAmount,
      newSharedEarnings: newSharedEarnings
    };
    
    console.log('Claim package success response:', response);
    res.json(response);
  } catch (error) {
    console.error('Error claiming earnings:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    
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
      message: 'Error claiming earnings',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
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

        // Find the package (can be active or completed but unclaimed)
        const pkg = await Package.findOne({
            _id: packageId,
            user: req.user._id,
            $or: [
                { status: 'active' },
                { status: 'completed' }
            ]
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

        // Validate package data
        if (!pkg.amount || !pkg.packageType || !pkg.endDate) {
            console.error('Invalid package data:', pkg);
            return res.status(400).json({ message: 'Invalid package data' });
        }

        const endDate = new Date(pkg.endDate);
        // For completed packages, we know they're matured
        // For active packages, check if they've matured
        if (pkg.status === 'active' && now < endDate) {
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
        
        try {
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
            } else {
                throw new Error(`Invalid package type: ${pkg.packageType}`);
            }
            
            // Validate calculated values
            if (isNaN(interestEarned) || isNaN(totalEarnings)) {
                throw new Error('Invalid calculated earnings');
            }
            
            console.log('Calculated earnings:', { 
                packageType: pkg.packageType, 
                amount: pkg.amount, 
                interestEarned, 
                totalEarnings 
            });
        } catch (calcError) {
            console.error('Error calculating earnings:', calcError);
            return res.status(400).json({ 
                success: false,
                message: 'Error calculating package earnings',
                error: calcError.message 
            });
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
        try {
            pkg.claimed = true;
            pkg.claimedAt = now;
            await pkg.save();
            console.log('Package updated successfully');
        } catch (saveError) {
            console.error('Error saving package:', saveError);
            return res.status(500).json({ 
                success: false,
                message: 'Error updating package status',
                error: saveError.message 
            });
        }

        // Credit principal + interest to Shared Capital Earnings
        try {
            const oldSharedEarnings = user.sharedEarnings || 0;
            user.sharedEarnings = parseFloat(((user.sharedEarnings || 0) + totalEarnings).toFixed(2));
            console.log('Updating user sharedEarnings:', { 
                old: oldSharedEarnings, 
                new: user.sharedEarnings, 
                added: totalEarnings 
            });
            await user.save();
            console.log('User updated successfully');
        } catch (userSaveError) {
            console.error('Error saving user:', userSaveError);
            // Try to revert package status
            try {
                pkg.claimed = false;
                delete pkg.claimedAt;
                await pkg.save();
            } catch (revertError) {
                console.error('Error reverting package status:', revertError);
            }
            return res.status(500).json({ 
                success: false,
                message: 'Error updating user earnings',
                error: userSaveError.message 
            });
        }

        // Create transaction record
        try {
            const transaction = new SharedCapitalTransaction({
                user: req.user._id,
                type: 'earning',
                amount: totalEarnings,
                package: `Package ${pkg.packageType}`,
                status: 'completed',
                description: `Claimed Package ${pkg.packageType}: principal ₱${pkg.amount.toLocaleString()} + interest ₱${interestEarned.toLocaleString()}`
            });
            console.log('Creating transaction:', { 
                user: req.user._id, 
                amount: totalEarnings, 
                package: `Package ${pkg.packageType}` 
            });
            await transaction.save();
            console.log('Transaction created successfully');
        } catch (transactionError) {
            console.error('Error creating transaction:', transactionError);
            // Try to revert user and package changes
            try {
                user.sharedEarnings = (user.sharedEarnings || 0) - totalEarnings;
                await user.save();
                
                pkg.claimed = false;
                delete pkg.claimedAt;
                await pkg.save();
            } catch (revertError) {
                console.error('Error reverting changes:', revertError);
            }
            return res.status(500).json({ 
                success: false,
                message: 'Error creating transaction record',
                error: transactionError.message 
            });
        }

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
        
        // Ensure all values are serializable
        const safeResponse = {
            success: true,
            message: 'Package claimed successfully',
            total: Number(totalEarnings),
            principal: Number(pkg.amount),
            interest: Number(interestEarned),
            packageType: Number(pkg.packageType),
            claimDate: now.toISOString()
        };
        
        res.json(safeResponse);
    } catch (error) {
        console.error('Error claiming package:', error);
        console.error('Error stack:', error.stack);
        console.error('Error details:', {
            name: error.name,
            message: error.message,
            code: error.code,
            keyValue: error.keyValue
        });

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

        if (error.name === 'MongoError' || error.name === 'MongoServerError') {
            return res.status(400).json({ 
                success: false,
                message: 'Database error',
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
        // Get all active packages AND completed but unclaimed packages
        const packages = await Package.find({
            user: req.user._id,
            $or: [
                {
                    status: 'active',
                    $or: [
                        { claimed: { $exists: false } },  // Not claimed (legacy support)
                        { claimed: false }                // Explicitly not claimed
                    ]
                },
                {
                    status: 'completed',
                    $or: [
                        { claimed: { $exists: false } },  // Not claimed (legacy support)
                        { claimed: false }                // Explicitly not claimed
                    ]
                }
            ]
        });
        
        console.log('Package query results:', {
            total: packages.length,
            active: packages.filter(p => p.status === 'active').length,
            completed: packages.filter(p => p.status === 'completed').length,
            claimed: packages.filter(p => p.claimed).length,
            unclaimed: packages.filter(p => !p.claimed).length
        });
        
        const now = new Date();
        console.log('Current time:', now);
        console.log('Found packages:', packages.map(p => ({
            _id: p._id,
            packageType: p.packageType,
            status: p.status,
            claimed: p.claimed,
            startDate: p.startDate,
            endDate: p.endDate,
            isMatured: new Date(p.endDate) <= now,
            daysRemaining: Math.ceil((new Date(p.endDate) - now) / (1000 * 60 * 60 * 24))
        })));

        // Process packages and filter out any null values from invalid packages
        const formattedPackages = packages.map(pkg => {
            // Debug logging for packages with potential date issues
            if (!pkg.startDate || !pkg.endDate) {
                console.error('Package with missing dates:', {
                    _id: pkg._id,
                    startDate: pkg.startDate,
                    endDate: pkg.endDate,
                    packageType: pkg.packageType
                });
                // Skip this package as it's invalid
                return null;
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
                // Skip this package as it has invalid dates
                return null;
            }
            
            // Calculate package metrics
            totalDays = pkg.packageType === 1 ? 12 : 
                      pkg.packageType === 2 ? 20 : 
                      pkg.packageType === 4 ? 40 : 30;
            daysSinceStart = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
            daysRemaining = Math.max(0, Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)));
            isMatured = now >= endDate;

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
            } else if (pkg.packageType === 4) {
                // Package 4: Scale based on investment amount
                // Base: ₱1000 → ₱125 daily for 40 days (4 periods of 10 days)
                const baseAmount = 1000;
                const baseDaily = 125;
                const baseTotal = 5000;
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

        // Filter out any null packages before sending the response
        const validPackages = formattedPackages.filter(pkg => pkg !== null);
        console.log('Sending valid packages:', validPackages.length);
        res.json(validPackages);
    } catch (error) {
        console.error('Error fetching active packages:', error);
        res.status(500).json({ message: 'Error fetching active packages' });
    }
};

// Handle Package 4 claims and rollovers (every 10 days)
exports.handlePackage4Claim = async (req, res) => {
    try {
        const { packageId, action } = req.body; // action can be 'claim' or 'rollover'
        const userId = req.user._id;

        console.log('Package 4 claim/rollover request:', { packageId, action, userId });

        // Validate input
        if (!packageId || !action) {
            return res.status(400).json({
                success: false,
                message: 'Package ID and action are required'
            });
        }

        if (!['claim', 'rollover'].includes(action)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid action. Must be "claim" or "rollover"'
            });
        }

        // Find the package
        const pkg = await Package.findOne({
            _id: packageId,
            user: userId,
            packageType: 4, // Only Package 4 supports partial claims
            status: 'active'
        });

        if (!pkg) {
            return res.status(404).json({
                success: false,
                message: 'Package not found or not available for claim/rollover'
            });
        }

        // Calculate current period based on start date
        const now = new Date();
        const startDate = new Date(pkg.startDate);
        const daysSinceStart = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
        const currentPeriod = Math.floor(daysSinceStart / 10) + 1; // 1-based period (1, 2, 3, 4)

        // Check if we're at a valid claim period (every 10 days)
        if (daysSinceStart % 10 !== 0 && daysSinceStart < 40) {
            const nextClaimDay = Math.ceil(daysSinceStart / 10) * 10;
            const daysUntilNextClaim = nextClaimDay - daysSinceStart;
            return res.status(400).json({
                success: false,
                message: `Cannot claim yet. Next claim available in ${daysUntilNextClaim} days.`
            });
        }

        // Check if this period has already been claimed
        if (pkg.partialClaims && pkg.partialClaims.some(claim => claim.period === currentPeriod)) {
            return res.status(400).json({
                success: false,
                message: `Period ${currentPeriod} has already been claimed.`
            });
        }

        // Get settings for Package 4
        const settings = await mongoose.model('Settings').findOne();
        const claimAmount = settings.package4ClaimAmount || 1250;
        const rolloverMinimum = settings.package4RolloverMinimum || 1000;

        // For the final period (4th), only allow rollover
        if (currentPeriod === 4 && action === 'claim') {
            return res.status(400).json({
                success: false,
                message: 'Final period must be rolled over to Package 4.'
            });
        }

        // Handle claim action
        if (action === 'claim') {
            // Get user
            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }

            // Update user's shared earnings
            user.sharedEarnings = parseFloat(((user.sharedEarnings || 0) + claimAmount).toFixed(2));
            await user.save();

            // Record the partial claim
            pkg.partialClaims.push({
                claimDate: now,
                amount: claimAmount,
                period: currentPeriod
            });

            // Set next claim date
            const nextClaimDate = new Date(startDate);
            nextClaimDate.setDate(startDate.getDate() + (currentPeriod * 10));
            pkg.nextClaimDate = nextClaimDate;

            await pkg.save();

            // Create transaction record
            const transaction = new SharedCapitalTransaction({
                user: userId,
                type: 'earning',
                amount: claimAmount,
                package: 'Package 4',
                status: 'completed',
                description: `Claimed Package 4 period ${currentPeriod}: ₱${claimAmount.toLocaleString()}`
            });
            await transaction.save();

            return res.json({
                success: true,
                message: `Successfully claimed ₱${claimAmount} for period ${currentPeriod}`,
                claimedAmount: claimAmount,
                period: currentPeriod,
                nextClaimDate: nextClaimDate
            });
        }

        // Handle rollover action
        if (action === 'rollover') {
            // Create a new Package 4
            const newPackage = new Package({
                user: userId,
                packageType: 4,
                amount: rolloverMinimum, // Use the minimum amount for rollover
                status: 'active',
                startDate: now,
                endDate: new Date(now.getTime() + (40 * 24 * 60 * 60 * 1000)), // 40 days
                dailyIncome: 125, // Base daily income for Package 4
                totalEarnings: 0,
                claimed: false
            });

            await newPackage.save();

            // If it's the final period, mark the original package as claimed
            if (currentPeriod === 4) {
                pkg.claimed = true;
                pkg.claimedAt = now;
                pkg.status = 'completed';
            }

            // Record the partial claim/rollover
            pkg.partialClaims.push({
                claimDate: now,
                amount: rolloverMinimum,
                period: currentPeriod
            });

            // Set next claim date
            if (currentPeriod < 4) {
                const nextClaimDate = new Date(startDate);
                nextClaimDate.setDate(startDate.getDate() + (currentPeriod * 10));
                pkg.nextClaimDate = nextClaimDate;
            }

            await pkg.save();

            // Create transaction record
            const transaction = new SharedCapitalTransaction({
                user: userId,
                type: 'rollover',
                amount: rolloverMinimum,
                package: 'Package 4',
                status: 'completed',
                description: `Rolled over Package 4 period ${currentPeriod}: ₱${rolloverMinimum.toLocaleString()}`
            });
            await transaction.save();

            return res.json({
                success: true,
                message: `Successfully rolled over ₱${rolloverMinimum} for period ${currentPeriod}`,
                rolledOverAmount: rolloverMinimum,
                period: currentPeriod,
                newPackage: {
                    id: newPackage._id,
                    startDate: newPackage.startDate,
                    endDate: newPackage.endDate
                }
            });
        }
    } catch (error) {
        console.error('Error handling Package 4 claim/rollover:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing claim/rollover',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

// Rollover matured package to a higher tier package
exports.rolloverPackage = async (req, res) => {
    try {
        const { packageId, targetPackageType, period } = req.body;
        const userId = req.user._id;
        
        // Find the package first
        const pkg = await Package.findOne({
            _id: packageId,
            user: userId,
            $or: [
                { status: 'active' },
                { status: 'completed' }
            ]
        });

        if (!pkg) {
            return res.status(404).json({ 
                success: false,
                message: 'Package not found or not available for rollover' 
            });
        }

        const isPartialRollover = pkg.packageType === 4 && pkg.canClaimPartial;

        console.log('Rollover request:', { packageId, targetPackageType, userId, period, isPartialRollover });

        // Validate input
        if (!packageId || !targetPackageType) {
            return res.status(400).json({ 
                success: false,
                message: 'Package ID and target package type are required' 
            });
        }

        // Package found, continue with rollover logic

        // For Package 4, check if it's a partial rollover (every 10 days)
        let totalEarnings;
        const now = new Date();
        const packageEndDate = new Date(pkg.endDate);
        
        if (pkg.packageType === 4) {
            const daysSinceStart = Math.floor((now - pkg.startDate) / (1000 * 60 * 60 * 24));
            const currentPeriod = Math.floor(daysSinceStart / 10) + 1;
            
            // For partial rollovers, check if we're at a valid claim period
            if (isPartialRollover) {
                if (daysSinceStart % 10 !== 0 || daysSinceStart > 40) {
                    return res.status(400).json({
                        success: false,
                        message: 'Can only rollover on 10-day intervals for Package 4'
                    });
                }
                totalEarnings = 1250; // Fixed amount for each 10-day period
            } else if (now < packageEndDate) {
                return res.status(400).json({
                    success: false,
                    message: 'Package has not matured yet'
                });
            } else {
                // Full maturity rollover
                totalEarnings = 5000; // Total for full 40-day term
            }
        } else {
            // For packages 1-3, standard rollover logic
            if (now < packageEndDate) {
                return res.status(400).json({
                    success: false,
                    message: 'Package has not matured yet'
                });
            }

            // Calculate earnings based on package type
            if (pkg.packageType === 1) {
                const baseAmount = 100;
                const baseTotal = 120;
                const multiplier = pkg.amount / baseAmount;
                totalEarnings = parseFloat((baseTotal * multiplier).toFixed(2));
            } else if (pkg.packageType === 2) {
                const baseAmount = 500;
                const baseTotal = 750;
                const multiplier = pkg.amount / baseAmount;
                totalEarnings = parseFloat((baseTotal * multiplier).toFixed(2));
            } else if (pkg.packageType === 3) {
                const baseAmount = 1000;
                const baseTotal = 3000;
                const multiplier = pkg.amount / baseAmount;
                totalEarnings = parseFloat((baseTotal * multiplier).toFixed(2));
            }
        }

        // Check if already claimed (for non-partial rollovers)
        if (!isPartialRollover && pkg.claimed) {
            return res.status(400).json({
                success: false,
                message: 'Package has already been claimed'
            });
        }

        // Validate rollover eligibility based on package type
        const rolloverRules = {
            1: {  // From Package 1
                1: { minAmount: 0 },    // Can rollover to Package 1 with any amount
                2: { minAmount: 500 },  // Need at least ₱500 to rollover to Package 2
                3: { minAmount: 1000 }, // Need at least ₱1000 to rollover to Package 3
                4: { minAmount: 1000 }  // Need at least ₱1000 to rollover to Package 4
            },
            2: {  // From Package 2
                2: { minAmount: 0 },    // Can rollover to Package 2 with any amount
                3: { minAmount: 1000 }, // Need at least ₱1000 to rollover to Package 3
                4: { minAmount: 1000 }  // Need at least ₱1000 to rollover to Package 4
            },
            3: {  // From Package 3
                3: { minAmount: 0 },    // Can rollover to Package 3 with any amount
                4: { minAmount: 1000 }  // Need at least ₱1000 to rollover to Package 4
            },
            4: {  // From Package 4
                4: { minAmount: 0 }     // Can only rollover to Package 4 with any amount
            }
        };

        // Check if this rollover is allowed
        const rule = rolloverRules[pkg.packageType]?.[targetPackageType];
        if (!rule) {
            return res.status(400).json({
                success: false,
                message: `Cannot rollover from Package ${pkg.packageType} to Package ${targetPackageType}`
            });
        }

        // Check minimum amount requirement
        if (totalEarnings < rule.minAmount) {
            return res.status(400).json({
                success: false,
                message: `Insufficient earnings for Package ${targetPackageType} rollover. Minimum required: ₱${rule.minAmount}`
            });
        }

        // Calculate new package details
        let newAmount, newDailyIncome, newTotalDays, newPackage;
        const startDate = new Date();
        
        if (targetPackageType === 1) {
            newTotalDays = 12;
            newAmount = totalEarnings;
            newDailyIncome = parseFloat((newAmount * 1.667 / 100).toFixed(2));
        } else if (targetPackageType === 2) {
            newTotalDays = 20;
            newAmount = totalEarnings;
            newDailyIncome = parseFloat((newAmount * 12.5 / 500).toFixed(2));
        } else if (targetPackageType === 3) {
            newTotalDays = 30;
            newAmount = totalEarnings;
            newDailyIncome = parseFloat((newAmount * 100 / 1000).toFixed(2));
        } else if (targetPackageType === 4) {
            newTotalDays = 40;
            newAmount = totalEarnings;
            newDailyIncome = parseFloat((newAmount * 125 / 1000).toFixed(2));
            
            // For Package 4, set up the 10-day claim periods
            const nextClaimDate = new Date(startDate);
            nextClaimDate.setDate(startDate.getDate() + 10);
            
            newPackage = new Package({
                user: userId,
                packageType: 4,
                amount: newAmount,
                status: 'active',
                startDate: startDate,
                endDate: new Date(startDate.getTime() + (40 * 24 * 60 * 60 * 1000)),
                dailyIncome: newDailyIncome,
                totalEarnings: 0,
                claimed: false,
                nextClaimDate: nextClaimDate,
                partialClaims: []
            });
        }

        const newEndDate = new Date(startDate.getTime() + (newTotalDays * 24 * 60 * 60 * 1000));

        // Handle the original package
        if (isPartialRollover) {
            // For partial rollovers, just add to partial claims
            pkg.partialClaims = pkg.partialClaims || [];
            pkg.partialClaims.push({
                claimDate: now,
                amount: totalEarnings,
                period: period,
                rolledOver: true,
                targetPackage: targetPackageType
            });
            await pkg.save();
        } else {
            // For full rollovers, mark as claimed
            pkg.claimed = true;
            pkg.claimedAt = now;
            pkg.status = 'completed';
            pkg.totalEarnings = totalEarnings;
            await pkg.save();
        }

        // Create new package if not already created (Package 4 is created above)
        if (!newPackage) {
            newPackage = new Package({
                user: userId,
                packageType: targetPackageType,
                amount: newAmount,
                status: 'active',
                startDate: startDate,
                endDate: newEndDate,
                dailyIncome: newDailyIncome,
                totalEarnings: 0,
                claimed: false
            });
        }

        await newPackage.save();

        // Create transaction record for rollover
        const transaction = new SharedCapitalTransaction({
            user: userId,
            type: 'rollover',
            amount: totalEarnings,
            package: `Rollover from Package ${pkg.packageType} to Package ${targetPackageType}`,
            status: 'completed',
            description: `Rolled over Package ${pkg.packageType} (₱${pkg.amount.toLocaleString()}) to Package ${targetPackageType} (₱${newAmount.toLocaleString()})`
        });
        await transaction.save();

        console.log('Rollover completed successfully:', {
            originalPackage: {
                id: pkg._id,
                type: pkg.packageType,
                amount: pkg.amount,
                earnings: totalEarnings
            },
            newPackage: {
                id: newPackage._id,
                type: targetPackageType,
                amount: newAmount,
                dailyIncome: newDailyIncome,
                totalDays: newTotalDays
            }
        });

        res.json({
            success: true,
            message: `Successfully rolled over Package ${pkg.packageType} to Package ${targetPackageType}`,
            originalPackage: {
                id: pkg._id,
                type: pkg.packageType,
                amount: pkg.amount,
                earnings: totalEarnings
            },
            newPackage: {
                id: newPackage._id,
                type: targetPackageType,
                amount: newAmount,
                dailyIncome: newDailyIncome,
                totalDays: newTotalDays,
                startDate: startDate,
                endDate: newEndDate
            }
        });

    } catch (error) {
        console.error('Error in rollover package:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error processing rollover',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};
