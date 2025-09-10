const mongoose = require('mongoose');

const packageSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  packageType: {
    type: Number,
    required: true,
    enum: [1, 2, 3, 4] // 1 for 12 days, 2 for 20 days, 3 for 30 days, 4 for 40 days
  },
  amount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'completed', 'expired'],
    default: 'active'
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  dailyIncome: {
    type: Number,
    required: true
  },
  totalEarnings: {
    type: Number,
    default: 0
  },
  totalAmount: {
    type: Number,
    get: function() {
      return (this.amount || 0) + (this.totalEarnings || 0);
    }
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  claimed: {
    type: Boolean,
    default: false
  },
  claimedAt: {
    type: Date
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Package', packageSchema);