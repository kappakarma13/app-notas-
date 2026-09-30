import { FlexcilDocument, FolderItem, PageData } from '../types';

const DB_NAME = 'FlexcilUnlimitedDB';
const DB_VERSION = 1;
const STORE_DOCS = 'documents';
const STORE_FOLDERS = 'folders';
const STORE_SETTINGS = 'settings';

class FlexcilDatabase {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_DOCS)) {
          const docStore = db.createObjectStore(STORE_DOCS, { keyPath: 'id' });
          docStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          docStore.createIndex('type', 'type', { unique: false });
          docStore.createIndex('folderId', 'folderId', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_FOLDERS)) {
          db.createObjectStore(STORE_FOLDERS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });

    return this.dbPromise;
  }

  async getAllDocuments(): Promise<FlexcilDocument[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DOCS, 'readonly');
      const store = tx.objectStore(STORE_DOCS);
      const request = store.getAll();

      request.onsuccess = () => {
        const results = (request.result as FlexcilDocument[]) || [];
        // Sort by updatedAt desc
        results.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getDocument(id: string): Promise<FlexcilDocument | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DOCS, 'readonly');
      const store = tx.objectStore(STORE_DOCS);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async saveDocument(doc: FlexcilDocument): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DOCS, 'readwrite');
      const store = tx.objectStore(STORE_DOCS);
      const updatedDoc = {
        ...doc,
        updatedAt: Date.now(),
      };
      const request = store.put(updatedDoc);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteDocument(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DOCS, 'readwrite');
      const store = tx.objectStore(STORE_DOCS);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAllFolders(): Promise<FolderItem[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_FOLDERS, 'readonly');
      const store = tx.objectStore(STORE_FOLDERS);
      const request = store.getAll();

      request.onsuccess = () => resolve((request.result as FolderItem[]) || []);
      request.onerror = () => reject(request.error);
    });
  }

  async saveFolder(folder: FolderItem): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_FOLDERS, 'readwrite');
      const store = tx.objectStore(STORE_FOLDERS);
      const request = store.put(folder);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteFolder(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_FOLDERS, 'readwrite');
      const store = tx.objectStore(STORE_FOLDERS);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getSetting<T>(key: string, defaultValue: T): Promise<T> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_SETTINGS, 'readonly');
        const store = tx.objectStore(STORE_SETTINGS);
        const request = store.get(key);
        request.onsuccess = () => {
          if (request.result && request.result.value !== undefined) {
            resolve(request.result.value);
          } else {
            resolve(defaultValue);
          }
        };
        request.onerror = () => resolve(defaultValue);
      });
    } catch {
      return defaultValue;
    }
  }

  async setSetting<T>(key: string, value: T): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_SETTINGS, 'readwrite');
        const store = tx.objectStore(STORE_SETTINGS);
        const request = store.put({ key, value });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch {
      // ignore
    }
  }
}

export const flexcilDB = new FlexcilDatabase();

// Default seed documents if database is completely empty
export function createInitialSampleDocuments(): FlexcilDocument[] {
  const now = Date.now();

  const emptyPages = (count: number): Record<number, PageData> => {
    const pages: Record<number, PageData> = {};
    for (let i = 1; i <= count; i++) {
      pages[i] = {
        pageNumber: i,
        strokes: [],
        shapes: [],
        textNotes: [],
        clippings: [],
        stickers: [],
      };
    }
    return pages;
  };

  const sampleBookPages = emptyPages(12);
  // Add some sample annotations to page 1 of sample notebook
  sampleBookPages[1] = {
    pageNumber: 1,
    strokes: [
      {
        id: 'stroke-1',
        tool: 'highlighter',
        color: '#fef08a',
        width: 18,
        opacity: 0.5,
        points: [
          { x: 60, y: 110 },
          { x: 380, y: 110 },
        ],
      },
      {
        id: 'stroke-2',
        tool: 'pen',
        color: '#2563eb',
        width: 3,
        opacity: 1,
        points: [
          { x: 60, y: 155 },
          { x: 70, y: 154 },
          { x: 120, y: 156 },
          { x: 180, y: 155 },
        ],
      },
    ],
    shapes: [
      {
        id: 'shape-1',
        shape: 'rectangle',
        x: 55,
        y: 200,
        width: 480,
        height: 110,
        strokeColor: '#3b82f6',
        strokeWidth: 2,
        fillColor: 'rgba(59, 130, 246, 0.05)',
      },
    ],
    textNotes: [
      {
        id: 'txt-1',
        x: 65,
        y: 80,
        text: '📝 Mis Apuntes Universitarios con Flexcil',
        fontSize: 22,
        color: '#1e293b',
      },
      {
        id: 'txt-2',
        x: 75,
        y: 220,
        text: '💡 ¡Tienda 100% GRATIS y Sin Límite de Archivo!\nPuedes abrir notas flotantes, arrastrar recortes de PDFs y sincronizar con Windows.',
        fontSize: 15,
        color: '#2563eb',
      },
    ],
    clippings: [],
    stickers: [
      {
        id: 'stk-1',
        x: 460,
        y: 65,
        width: 70,
        height: 70,
        emoji: '⭐',
        title: 'Estrella Destacada',
      },
      {
        id: 'stk-2',
        x: 70,
        y: 340,
        width: 140,
        height: 44,
        emoji: '📌 IMPORTANTE',
        title: 'Nota Urgente',
      },
    ],
  };

  const samplePlannerPages = emptyPages(8);
  samplePlannerPages[1] = {
    pageNumber: 1,
    strokes: [],
    shapes: [],
    textNotes: [
      {
        id: 'p-1',
        x: 70,
        y: 90,
        text: '📅 Planificador Semanal & Metas de Estudio',
        fontSize: 20,
        color: '#0f172a',
      },
      {
        id: 'p-2',
        x: 70,
        y: 160,
        text: '• Repasar Biología Celular y Neuroanatomía\n• Completar resumen con recortes del PDF\n• Exportar copia de seguridad a Windows PC',
        fontSize: 14,
        color: '#334155',
      },
    ],
    clippings: [],
    stickers: [
      {
        id: 'stk-p1',
        x: 440,
        y: 80,
        width: 80,
        height: 40,
        emoji: '🎯 META',
        title: 'Meta',
      },
    ],
  };

  const samplePdfPages = emptyPages(16);
  samplePdfPages[1] = {
    pageNumber: 1,
    strokes: [
      {
        id: 'pdf-stk-1',
        tool: 'highlighter',
        color: '#86efac',
        width: 20,
        opacity: 0.45,
        points: [
          { x: 50, y: 180 },
          { x: 420, y: 180 },
        ],
      },
    ],
    shapes: [],
    textNotes: [
      {
        id: 'pdf-note-1',
        x: 50,
        y: 130,
        text: 'Capítulo 1: Fundamentos de Anatomía y Fisiología',
        fontSize: 20,
        color: '#1e3a8a',
      },
      {
        id: 'pdf-note-2',
        x: 50,
        y: 220,
        text: 'La célula constituye la unidad morfológica y funcional de todo ser vivo. En los organismos pluricelulares, las células se organizan en tejidos, órganos y sistemas coordinados.\n\nUsa la herramienta de "Recorte (Clipper)" para capturar cualquier sección o diagrama y arrastrarlo a tu libreta flotante de notas.',
        fontSize: 14,
        color: '#334155',
      },
    ],
    clippings: [],
    stickers: [],
    bookmark: true,
  };

  return [
    {
      id: 'doc-sample-pdf-1',
      title: 'Manual de Biología y Fisiología Humana.pdf',
      type: 'pdf',
      totalPages: 16,
      currentPage: 1,
      createdAt: now - 3600 * 24 * 1000 * 2,
      updatedAt: now - 3600 * 1000,
      paperTemplate: 'blank',
      coverColor: '#2563eb',
      coverStyle: 'medical',
      tags: ['Universidad', 'PDF', 'Biología'],
      fileSizeBytes: 4200000,
      pages: samplePdfPages,
      isFavorite: true,
    },
    {
      id: 'doc-sample-notes-1',
      title: 'Apuntes Cornell de Estudio - Flexcil',
      type: 'notebook',
      totalPages: 12,
      currentPage: 1,
      createdAt: now - 3600 * 24 * 1000 * 1,
      updatedAt: now - 1800 * 1000,
      paperTemplate: 'cornell',
      coverColor: '#059669',
      coverStyle: 'cornell',
      tags: ['Apuntes', 'Cornell', 'Examen'],
      pages: sampleBookPages,
      isFavorite: true,
    },
    {
      id: 'doc-sample-planner-1',
      title: 'Planificador Semanal 2026 - Flexcil Store Gratis',
      type: 'notebook',
      totalPages: 8,
      currentPage: 1,
      createdAt: now - 3600 * 24 * 1000 * 3,
      updatedAt: now - 600 * 1000,
      paperTemplate: 'planner-weekly',
      coverColor: '#7c3aed',
      coverStyle: 'aesthetic',
      tags: ['Planner', 'Gratis', 'Organización'],
      pages: samplePlannerPages,
      isFavorite: false,
    },
  ];
}

export function createInitialFolders(): FolderItem[] {
  const now = Date.now();
  return [
    { id: 'f-uni', name: 'Universidad & Clases', color: '#2563eb', createdAt: now - 10000 },
    { id: 'f-exam', name: 'Exámenes y Resúmenes', color: '#dc2626', createdAt: now - 9000 },
    { id: 'f-personal', name: 'Diarios y Planners', color: '#7c3aed', createdAt: now - 8000 },
    { id: 'f-work', name: 'Documentos Windows Sync', color: '#059669', createdAt: now - 7000 },
  ];
}
