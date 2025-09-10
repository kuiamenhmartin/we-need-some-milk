const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// MongoDB connection string from environment or use default
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/wealthclick';

async function updatePackages() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Get the database connection
    const db = mongoose.connection;
    
    // Check if the packages collection exists
    const collections = await db.db.listCollections({ name: 'packages' }).toArray();
    if (collections.length === 0) {
      console.log('No packages collection found. Nothing to update.');
      process.exit(0);
    }

    // Get the packages collection
    const packages = db.collection('packages');
    
    // Update all packages to include the new fields if they don't exist
    const result = await packages.updateMany(
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
    console.log(`Updated ${result.modifiedCount} documents`);
    
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

updatePackages();
