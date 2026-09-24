export interface SavedProject {
  id: string;
  fileName: string;
  createdAt: number;
  video: Blob;
  captionsVtt: string | null;
  captionError?: string;
  sceneMarkers: number[];
  duration: number;
}

const DB_NAME = "splice-projects";
const STORE_NAME = "recent";
const HISTORY_LIMIT = 5;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This browser does not support local project history."));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local project history."));
  });
}

export async function listSavedProjects(): Promise<SavedProject[]> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve((request.result as SavedProject[]).sort((a, b) => b.createdAt - a.createdAt));
      request.onerror = () => reject(request.error ?? new Error("Could not read project history."));
    });
  } finally {
    db.close();
  }
}

export async function saveProject(project: SavedProject): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        const older = (request.result as SavedProject[])
          .filter((entry) => entry.id !== project.id)
          .sort((a, b) => b.createdAt - a.createdAt);
        older.slice(HISTORY_LIMIT - 1).forEach((entry) => store.delete(entry.id));
        store.put(project);
      };
      request.onerror = () => transaction.abort();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not save this project in browser storage."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Could not save this project in browser storage."));
    });
  } finally {
    db.close();
  }
}

export async function deleteSavedProject(id: string): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not delete this project from browser history."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Could not delete this project from browser history."));
    });
  } finally {
    db.close();
  }
}
