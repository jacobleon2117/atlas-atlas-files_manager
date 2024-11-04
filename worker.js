import Bull from 'bull';
import imageThumbnail from 'image-thumbnail';
import { ObjectId } from 'mongodb';
import fs from 'fs';
import dbClient from './utils/db';

const fileQueue = new Bull('fileQueue');

const generateThumbnail = async (path, width) => {
  const thumbnail = await imageThumbnail(path, { width });
  const thumbnailPath = `${path}_${width}`;
  await fs.promises.writeFile(thumbnailPath, thumbnail);
};

fileQueue.process(async (job) => {
  const { fileId, userId } = job.data;
  if (!fileId) throw new Error('Missing fileId');
  if (!userId) throw new Error('Missing userId');

  const file = await dbClient.db.collection('files')
    .findOne({ 
      _id: new ObjectId(fileId), 
      userId: new ObjectId(userId) 
    });

  if (!file) throw new Error('File not found');

  const sizes = [500, 250, 100];
  for (const size of sizes) {
    await generateThumbnail(file.localPath, size);
  }
});

export default fileQueue;