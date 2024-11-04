import { MongoClient } from 'mongodb';

class DBClient {
  constructor() {
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || '27017';
    const database = process.env.DB_DATABASE || 'files_manager';
    
    const url = `mongodb://${host}:${port}`;

    this.client = new MongoClient(url, { useUnifiedTopology: true });
    this.client.connect()
      .then(() => {
        this.db = this.client.db(database);
      })
      .catch((error) => {
        console.error(`MongoDB connection error: ${error}`);
      });
  }

  isAlive() {
    return !!this.client && !!this.db;
  }

  async nbUsers() {
    if (!this.isAlive()) {
      return 0;
    }
    try {
      const count = await this.db.collection('users').countDocuments();
      return count;
    } catch (error) {
      console.error(`Error counting users: ${error}`);
      return 0;
    }
  }

  async nbFiles() {
    if (!this.isAlive()) {
      return 0;
    }
    try {
      const count = await this.db.collection('files').countDocuments();
      return count;
    } catch (error) {
      console.error(`Error counting files: ${error}`);
      return 0;
    }
  }
}

const dbClient = new DBClient();
export default dbClient;