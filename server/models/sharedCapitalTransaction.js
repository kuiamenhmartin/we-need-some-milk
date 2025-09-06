const mongoose = require('mongoose');

const sharedCapitalTransactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['deposit', 'earning', 'withdrawal', 'rollover'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  package: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending'
  },
  referenceId: String,
  packageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Package'
  }
}, {
  timestamps: true
});

const SharedCapitalTransaction = mongoose.model('SharedCapitalTransaction', sharedCapitalTransactionSchema);

module.exports = SharedCapitalTransaction;
