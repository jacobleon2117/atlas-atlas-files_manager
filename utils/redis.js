import { createClient } from 'redis';
import { promisify } from 'util';

class RedisClient {
  constructor() {
    this.client = createClient();
    
    this.client.on('error', (error) => {
      console.log(`Redis client error: ${error}`);
    });

    this._get = promisify(this.client.get).bind(this.client);
    this._set = promisify(this.client.set).bind(this.client);
    this._del = promisify(this.client.del).bind(this.client);
  }

  isAlive() {
    return this.client.connected;
  }

  async get(key) {
    try {
      const value = await this._get(key);
      return value;
    } catch (error) {
      console.error(`Error getting key ${key}: ${error}`);
      return null;
    }
  }

  async set(key, value, duration) {
    try {
      await this._set(key, value, 'EX', duration);
      return true;
    } catch (error) {
      console.error(`Error setting key ${key}: ${error}`);
      return false;
    }
  }

  async del(key) {
    try {
      await this._del(key);
      return true;
    } catch (error) {
      console.error(`Error deleting key ${key}: ${error}`);
      return false;
    }
  }
}

const redisClient = new RedisClient();
export default redisClient;