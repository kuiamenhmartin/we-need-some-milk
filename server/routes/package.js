const express = require('express');
const router = express.Router();
const Package = require('../models/Package');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const { isAdmin } = require('../middleware/auth');
const agentController = require('../controllers/agentController');

// Get all packages for a user
router.get('/my-packages', auth, async (req, res) => {
  try {
    const packages = await Package.find({ user: req.user.id })
      .sort({ createdAt: -1 });
    res.json(packages);
  } catch (error) {
    console.error('Error fetching packages:', error);
    res.status(500).json({ message: 'Error fetching packages' });
  }
});

// Handle Package 4 claims and rollovers (every 10 days)
router.post('/package4-claim', auth, agentController.handlePackage4Claim);

// Create a new package request
router.post('/request', auth, async (req, res) => {
  try {
    const { packageType, amount } = req.body;
    
    // Validate package type and amount
    if (![1, 2, 3, 4].includes(packageType)) {
      return res.status(400).json({ message: 'Invalid package type' });
    }

    // Validate amount based on package type
    if ((packageType === 1 && amount !== 100) || 
        (packageType === 2 && amount !== 500) ||
        (packageType === 3 && amount < 1000) ||
        (packageType === 4 && amount < 1000)) {
      return res.status(400).json({ 
        message: packageType === 1 
          ? 'Package 1 amount must be ₱100' 
          : packageType === 2
          ? 'Package 2 amount must be ₱500'
          : packageType === 3
          ? 'Package 3 amount must be at least ₱1000'
          : 'Package 4 amount must be at least ₱1000'
      });
    }
    
    // Check if user already has an active package of this type
    const existingPackage = await Package.findOne({
      user: req.user.id,
      packageType,
      status: 'active',
      $or: [
        { claimed: { $exists: false } },
        { claimed: false }
      ]
    });
    
    if (existingPackage) {
      return res.status(400).json({ 
        message: `You already have an active Package ${packageType}` 
      });
    }
    
    // Find the user
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if user has sufficient wallet balance
    if (user.wallet < amount) {
      return res.status(400).json({ message: 'Insufficient wallet balance' });
    }
    
    // Calculate package details
    const startDate = new Date();
    const endDate = new Date(startDate);
    const duration = packageType === 1 ? 12 : packageType === 2 ? 20 : packageType === 3 ? 30 : 40; // 12, 20, 30, or 40 days
    endDate.setDate(endDate.getDate() + duration);
    
    // Calculate daily income for all packages
    let dailyIncome;
    if (packageType === 1) {
      // Package 1: ₱100 investment → ₱1.667 daily → ₱120 total return (20% profit)
      const baseAmount = 100;
      const baseDaily = 1.667;
      const multiplier = amount / baseAmount;
      dailyIncome = baseDaily * multiplier;
    } else if (packageType === 2) {
      // Package 2: ₱500 investment → ₱12.5 daily → ₱750 total return (50% profit)
      const baseAmount = 500;
      const baseDaily = 12.5;
      const multiplier = amount / baseAmount;
      dailyIncome = baseDaily * multiplier;
    } else if (packageType === 3) {
      // Package 3: ₱1000 investment → ₱100 daily → ₱3000 total return (200% profit)
      const baseAmount = 1000;
      const baseDaily = 100;
      const multiplier = amount / baseAmount;
      dailyIncome = baseDaily * multiplier;
    } else if (packageType === 4) {
      // Package 4: ₱1000 investment → ₱125 daily → ₱5000 total return (500% profit)
      const baseAmount = 1000;
      const baseDaily = 125;
      const multiplier = amount / baseAmount;
      dailyIncome = baseDaily * multiplier;
    }
    
    const package = new Package({
      user: req.user.id,
      packageType,
      amount,
      status: 'active',
      startDate,
      endDate,
      dailyIncome
    });
    
    // Deduct amount from user's wallet
    user.wallet -= amount;
    
    // Save both the package and updated user
    await Promise.all([
      package.save(),
      user.save()
    ]);

    // === BEGIN REFERRAL COMMISSION LOGIC ===
    // Multi-level: Traverse up the referral chain, credit commission based on level
    let currentUser = user;
    let level = 1;
    // Package 4 has special commission rates: 5% direct, 2%, 2%, 1% indirect
    const commissionRates = packageType === 4 
      ? { 1: 0.05, 2: 0.02, 3: 0.02, 4: 0.01 }
      : { 1: 0.05, 2: 0.02, 3: 0.02, 4: 0.01 }; // Same rates for other packages
    const maxLevels = 4;
    const processedUsers = new Set();
    const Transaction = require('../models/Transaction');
    while (currentUser.referrer && level <= maxLevels && !processedUsers.has(currentUser.referrer.toString())) {
      const referrer = await User.findById(currentUser.referrer);
      if (!referrer || !referrer.isActive) {
        break;
      }
      const commissionRate = commissionRates[level] || 0;
      if (commissionRate > 0) {
        const commissionAmount = amount * commissionRate;
        if (level === 1) {
          referrer.referralEarnings.direct = (referrer.referralEarnings.direct || 0) + commissionAmount;
        } else {
          referrer.referralEarnings.indirect = (referrer.referralEarnings.indirect || 0) + commissionAmount;
        }
        await referrer.save();
        // Create transaction record
        await Transaction.create({
          user: referrer._id,
          type: 'referral',
          amount: commissionAmount,
          description: `Level ${level} referral commission from downline's package activation`,
          status: 'completed',
          relatedUser: user._id,
          metadata: {
            referralLevel: level,
            packageId: package._id,
            packageAmount: amount
          },
          referralType: level === 1 ? 'direct' : 'indirect'
        });
      }
      processedUsers.add(referrer._id.toString());
      currentUser = referrer;
      level++;
    }
    // === END REFERRAL COMMISSION LOGIC ===

    res.status(201).json({
      message: 'Package activated successfully',
      package,
      walletBalance: user.wallet
    });
  } catch (error) {
    console.error('Error creating package request:', error);
    res.status(500).json({ message: 'Error creating package request' });
  }
});

// Admin routes
router.get('/pending', auth, isAdmin, async (req, res) => {
  try {
    const packages = await Package.find({ status: 'pending' })
      .populate('user', 'name email')
      .sort({ createdAt: -1 });
    res.json(packages);
  } catch (error) {
    console.error('Error fetching pending packages:', error);
    res.status(500).json({ message: 'Error fetching pending packages' });
  }
});

router.put('/approve/:id', auth, isAdmin, async (req, res) => {
  try {
    const package = await Package.findById(req.params.id);
    
    if (!package) {
      return res.status(404).json({ message: 'Package not found' });
    }

    if (package.status !== 'pending') {
      return res.status(400).json({ message: 'Package is not pending' });
    }

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + package.duration);

    package.status = 'active';
    package.startDate = startDate;
    package.endDate = endDate;
    
    await package.save();

    // Update user's package
    await User.findByIdAndUpdate(package.user, {
      package: package._id
    });

    res.json(package);
  } catch (error) {
    console.error('Error approving package:', error);
    res.status(500).json({ message: 'Error approving package' });
  }
});

router.put('/reject/:id', auth, isAdmin, async (req, res) => {
  try {
    const package = await Package.findById(req.params.id);
    
    if (!package) {
      return res.status(404).json({ message: 'Package not found' });
    }

    if (package.status !== 'pending') {
      return res.status(400).json({ message: 'Package is not pending' });
    }

    package.status = 'rejected';
    await package.save();

    res.json(package);
  } catch (error) {
    console.error('Error rejecting package:', error);
    res.status(500).json({ message: 'Error rejecting package' });
  }
});

module.exports = router;