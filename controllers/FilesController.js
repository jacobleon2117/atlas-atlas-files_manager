import { ObjectId } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import Bull from 'bull';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

const fileQueue = new Bull('fileQueue');

class FilesController {
  static async postUpload(req, res) {
    const token = req.header('X-Token');
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { name, type, parentId = 0, isPublic = false, data } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Missing name' });
    }

    const validTypes = ['folder', 'file', 'image'];
    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({ error: 'Missing type' });
    }

    if (!data && type !== 'folder') {
      return res.status(400).json({ error: 'Missing data' });
    }

    if (parentId !== 0) {
      const parent = await dbClient.db.collection('files')
        .findOne({ _id: ObjectId(parentId) });

      if (!parent) {
        return res.status(400).json({ error: 'Parent not found' });
      }

      if (parent.type !== 'folder') {
        return res.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    const fileDocument = {
      userId: ObjectId(userId),
      name,
      type,
      isPublic,
      parentId: parentId === 0 ? '0' : ObjectId(parentId),
    };

    if (type === 'folder') {
      const result = await dbClient.db.collection('files').insertOne(fileDocument);
      fileDocument.id = result.insertedId;
      return res.status(201).json(fileDocument);
    }

    const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    const filename = uuidv4();
    const localPath = path.join(folderPath, filename);
    const fileContent = Buffer.from(data, 'base64');

    try {
      fs.writeFileSync(localPath, fileContent);
      fileDocument.localPath = localPath;
      
      const result = await dbClient.db.collection('files').insertOne(fileDocument);
      fileDocument.id = result.insertedId;

      if (type === 'image') {
        await fileQueue.add({
          userId: userId,
          fileId: result.insertedId.toString()
        });
      }
      
      return res.status(201).json(fileDocument);
    } catch (error) {
      return res.status(500).json({ error: 'Unable to save file' });
    }
  }

  static async getShow(req, res) {
    const token = req.header('X-Token');
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    
    if (!ObjectId.isValid(fileId)) {
      return res.status(404).json({ error: 'Not found' });
    }

    const file = await dbClient.db.collection('files')
      .findOne({ 
        _id: new ObjectId(fileId), 
        userId: new ObjectId(userId) 
      });

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    return res.status(200).json({
      id: file._id,
      userId: file.userId,
      name: file.name,
      type: file.type,
      isPublic: file.isPublic,
      parentId: file.parentId
    });
  }

  static async getIndex(req, res) {
    const token = req.header('X-Token');
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const page = parseInt(req.query.page) || 0;
    const parentId = req.query.parentId || '0';
    const MAX_PAGE_SIZE = 20;

    let parentIdQuery;
    if (parentId === '0') {
      parentIdQuery = '0';
    } else {
      if (!ObjectId.isValid(parentId)) {
        return res.status(200).json([]);
      }
      parentIdQuery = new ObjectId(parentId);
    }

    try {
      const files = await dbClient.db.collection('files')
        .find({ 
          userId: new ObjectId(userId),
          parentId: parentIdQuery
        })
        .skip(page * MAX_PAGE_SIZE)
        .limit(MAX_PAGE_SIZE)
        .toArray();

      const formattedFiles = files.map((file) => ({
        id: file._id,
        userId: file.userId,
        name: file.name,
        type: file.type,
        isPublic: file.isPublic,
        parentId: file.parentId
      }));

      return res.status(200).json(formattedFiles);
    } catch (error) {
      console.error('Error retrieving files:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async putPublish(req, res) {
    const token = req.header('X-Token');
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    
    if (!ObjectId.isValid(fileId)) {
      return res.status(404).json({ error: 'Not found' });
    }

    const file = await dbClient.db.collection('files').findOneAndUpdate(
      { _id: new ObjectId(fileId), userId: new ObjectId(userId) },
      { $set: { isPublic: true } },
      { returnDocument: 'after' }
    );

    if (!file.value) {
      return res.status(404).json({ error: 'Not found' });
    }

    return res.status(200).json({
      id: file.value._id,
      userId: file.value.userId,
      name: file.value.name,
      type: file.value.type,
      isPublic: file.value.isPublic,
      parentId: file.value.parentId
    });
  }

  static async putUnpublish(req, res) {
    const token = req.header('X-Token');
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    
    if (!ObjectId.isValid(fileId)) {
      return res.status(404).json({ error: 'Not found' });
    }

    const file = await dbClient.db.collection('files').findOneAndUpdate(
      { _id: new ObjectId(fileId), userId: new ObjectId(userId) },
      { $set: { isPublic: false } },
      { returnDocument: 'after' }
    );

    if (!file.value) {
      return res.status(404).json({ error: 'Not found' });
    }

    return res.status(200).json({
      id: file.value._id,
      userId: file.value.userId,
      name: file.value.name,
      type: file.value.type,
      isPublic: file.value.isPublic,
      parentId: file.value.parentId
    });
  }

  static async getFile(req, res) {
    const fileId = req.params.id;
    const size = req.query.size;
    
    if (!ObjectId.isValid(fileId)) {
      return res.status(404).json({ error: 'Not found' });
    }

    const file = await dbClient.db.collection('files')
      .findOne({ _id: new ObjectId(fileId) });

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (!file.isPublic) {
      const token = req.header('X-Token');
      let userId = null;
      
      if (token) {
        const key = `auth_${token}`;
        userId = await redisClient.get(key);
      }

      if (!userId || userId !== file.userId.toString()) {
        return res.status(404).json({ error: 'Not found' });
      }
    }

    if (file.type === 'folder') {
      return res.status(400).json({ error: "A folder doesn't have content" });
    }

    let filePath = file.localPath;
    
    if (size) {
      if (!['500', '250', '100'].includes(size)) {
        return res.status(400).json({ error: 'Invalid size' });
      }
      filePath = `${file.localPath}_${size}`;
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Not found' });
    }

    const mimeType = mime.lookup(file.name) || 'application/octet-stream';
    
    try {
      const fileContent = fs.readFileSync(filePath);
      res.setHeader('Content-Type', mimeType);
      return res.send(fileContent);
    } catch (error) {
      console.error('Error reading file:', error);
      return res.status(404).json({ error: 'Not found' });
    }
  }
}

export default FilesController;