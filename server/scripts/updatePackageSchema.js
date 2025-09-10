const mongoose = require('mongoose');
const config = require('../config/config');

async function updatePackageSchema() {
  try {
    // Connect to MongoDB using your app's config
    await mongoose.connect(config.mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Get the current connection
    const db = mongoose.connection;

    // Add new fields to the Package collection
    await db.collection('packages').updateMany(
      {},
      {
        $set: {
          // These fields will be added to documents that don't have them
          nextClaimDate: null,
          partialClaims: []
        }
      },
      { upsert: false }
    );

    console.log('Package schema updated successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

updatePackageSchema();
