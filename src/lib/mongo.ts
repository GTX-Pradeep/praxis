import "server-only";
import { MongoClient, type Db } from "mongodb";

const globalForMongo = globalThis as unknown as { mongoClient?: Promise<MongoClient> };

function connect() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not set. Copy .env.example to .env.local.");
  }
  return new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 }).connect();
}

export async function getMongo(): Promise<Db> {
  if (!globalForMongo.mongoClient) globalForMongo.mongoClient = connect();
  let client: MongoClient;
  try {
    client = await globalForMongo.mongoClient;
  } catch (err) {
    globalForMongo.mongoClient = undefined; // try again on the next call
    throw err;
  }
  return client.db(process.env.MONGODB_DB || "praxis");
}
