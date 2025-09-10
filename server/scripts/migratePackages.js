const mongoose = require('mongoose');
require('dotenv').config();

async function migrate() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/wealthclick', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Get the Package model
    const Package = mongoose.model('Package');

    // Add new fields if they don't exist
    const result = await Package.updateMany(
      {},
      {
        $setOnInsert: {
          nextClaimDate: null,
          partialClaims: []
        }
      },
      { upsert: false }
    );

    console.log('Migration completed successfully:', result);
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
