const mongoose = require('mongoose');

const packageSchema = new mongoose.Schema({
    amount: {
        type: Number,
        required: true
    },
    duration: {
        type: Number,
        required: true
    },
    income: {
        type: Number,
        required: true
    }
}, { _id: false });

const settingsSchema = new mongoose.Schema({
    // Amount earned per click in pesos
    clickReward: {
        type: Number,
        required: true,
        default: 0.20
    },
    // Maximum click earnings a user can accrue per day (in pesos)
    dailyClickCap: {
        type: Number,
        required: true,
        default: 10
    },
    // Direct registration referral bonus in pesos (10% of registration fee)
    referralBonus: {
        type: Number,
        required: true,
        default: 10
    },
    minimumWithdrawal: {
        type: Number,
        required: true,
        default: 500
    },
    sharedEarningPercentage: {
        type: Number,
        required: true,
        default: 0.5
    },
    // Referral percentages for shared-capital purchases
    sharedCapReferralRates: {
        type: Map,
        of: Number,
        default: {
            direct: 0.05,
            level2: 0.02,
            level3: 0.02,
            level4: 0.01
        }
    },
    packages: {
        type: Map,
        of: packageSchema,
        default: {
            package1: { amount: 100, duration: 12, income: 20 },
            package2: { amount: 500, duration: 20, income: 50 },
            package3: { amount: 1000, duration: 30, income: 200 }, // 200% profit = ₱2000, total return ₱3000
            package4: { amount: 1000, duration: 40, income: 500 } // 500% profit = ₱5000, total return ₱6000
        }
    },
    // Package 4 claim periods (every 10 days)
    package4ClaimPeriods: {
        type: Number,
        default: 4 // 4 periods of 10 days each
    },
    package4ClaimAmount: {
        type: Number,
        default: 1250 // Amount claimable every 10 days
    },
    package4RolloverMinimum: {
        type: Number,
        default: 1000 // Minimum amount required for rollover
    },
    paymentMethods: [{
        name: {
            type: String,
            required: true
        },
        accountName: {
            type: String,
            required: true
        },
        accountNumber: {
            type: String,
            required: true
        },
        qr: {
            type: String
        },
        details: {
            type: String
        }
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('Settings', settingsSchema);