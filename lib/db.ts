import { openDB, DBSchema, IDBPDatabase } from 'idb'

interface LampDB extends DBSchema {
  images: {
    key: number
    value: { id?: number; projectId: string; blob: Blob; createdAt: number }
  }
}

let dbPromise: Promise<IDBPDatabase<LampDB>> | null = null

function getDB(): Promise<IDBPDatabase<LampDB>> {
  if (typeof window === 'undefined') {
    throw new Error('IndexedDB is only available in the browser')
  }
  if (!dbPromise) {
    dbPromise = openDB<LampDB>('lamp-me-baby', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('images')) {
          db.createObjectStore('images', { keyPath: 'id', autoIncrement: true })
        }
      },
    })
  }
  return dbPromise
}

export async function putImage(projectId: string, blob: Blob): Promise<number> {
  const db = await getDB()
  return db.put('images', { projectId, blob, createdAt: Date.now() })
}

export async function getImage(id: number): Promise<Blob | undefined> {
  const db = await getDB()
  const record = await db.get('images', id)
  return record?.blob
}

export async function deleteImage(id: number): Promise<void> {
  const db = await getDB()
  await db.delete('images', id)
}
