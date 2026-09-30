import JSZip from 'jszip';
import { FlexcilDocument, WindowsSyncState } from '../types';
import { flexcilDB } from './db';

// Key for storing windows sync state
const SETTING_WINDOWS_SYNC = 'windows_sync_config';

class WindowsSyncService {
  private directoryHandle: any = null;
  private state: WindowsSyncState = {
    isConnected: false,
    folderName: null,
    lastSyncedAt: null,
    autoSync: true,
    status: 'idle',
    syncedDocsCount: 0,
    lastLog: 'Listo para conectar con tu carpeta de Windows.',
  };
  private listeners: Set<(state: WindowsSyncState) => void> = new Set();

  constructor() {
    this.init();
  }

  private async init() {
    try {
      const saved = await flexcilDB.getSetting<Partial<WindowsSyncState>>(SETTING_WINDOWS_SYNC, {});
      if (saved) {
        this.state = {
          ...this.state,
          ...saved,
          status: 'idle',
        };
        this.notify();
      }
    } catch {
      // ignore
    }
  }

  subscribe(listener: (state: WindowsSyncState) => void) {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((fn) => fn({ ...this.state }));
    flexcilDB.setSetting(SETTING_WINDOWS_SYNC, {
      isConnected: this.state.isConnected,
      folderName: this.state.folderName,
      lastSyncedAt: this.state.lastSyncedAt,
      autoSync: this.state.autoSync,
      syncedDocsCount: this.state.syncedDocsCount,
    });
  }

  getState(): WindowsSyncState {
    return { ...this.state };
  }

  isFileSystemAccessSupported(): boolean {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  }

  /**
   * Prompts the user to pick a folder on their Windows PC (e.g. C:\Users\Nombre\Documentos\Flexcil)
   */
  async connectWindowsFolder(): Promise<boolean> {
    if (!this.isFileSystemAccessSupported()) {
      this.state.status = 'error';
      this.state.lastLog = 'Tu navegador no soporta selección directa de carpetas. Usa la exportación ZIP a Windows.';
      this.notify();
      return false;
    }

    try {
      this.state.status = 'syncing';
      this.state.lastLog = 'Abriendo selector de carpetas de Windows...';
      this.notify();

      // Request directory on Windows
      const dirHandle = await (window as any).showDirectoryPicker({
        id: 'flexcil_windows_sync',
        mode: 'readwrite',
        startIn: 'documents',
      });

      this.directoryHandle = dirHandle;
      this.state.isConnected = true;
      this.state.folderName = dirHandle.name;
      this.state.lastLog = `Conectado exitosamente a la carpeta de Windows: "${dirHandle.name}".`;
      this.state.status = 'synced';
      this.notify();

      // Trigger initial sync
      await this.syncAllToWindows();
      return true;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        this.state.status = 'idle';
        this.state.lastLog = 'Selección de carpeta cancelada por el usuario.';
      } else {
        this.state.status = 'error';
        this.state.lastLog = `Error al conectar con carpeta de Windows: ${err.message || 'Permiso denegado'}`;
      }
      this.notify();
      return false;
    }
  }

  /**
   * Disconnects current Windows directory
   */
  disconnectWindowsFolder() {
    this.directoryHandle = null;
    this.state.isConnected = false;
    this.state.folderName = null;
    this.state.status = 'idle';
    this.state.lastLog = 'Carpeta de Windows desconectada.';
    this.notify();
  }

  toggleAutoSync(enabled: boolean) {
    this.state.autoSync = enabled;
    this.notify();
  }

  /**
   * Syncs all documents directly into the user's selected Windows directory
   */
  async syncAllToWindows(): Promise<{ success: boolean; count: number; error?: string }> {
    const docs = await flexcilDB.getAllDocuments();

    if (this.directoryHandle) {
      try {
        this.state.status = 'syncing';
        this.state.lastLog = `Sincronizando ${docs.length} documentos con Windows...`;
        this.notify();

        // Create or get subfolder "Flexcil_Notas" in Windows
        const flexcilDir = await this.directoryHandle.getDirectoryHandle('Flexcil_Notas', { create: true });
        
        // Write index manifest
        const manifestHandle = await flexcilDir.getFileHandle('sincronizacion_manifest.json', { create: true });
        const manifestWritable = await manifestHandle.createWritable();
        const manifestData = {
          app: 'Flexcil Free for Windows',
          lastSync: new Date().toISOString(),
          documentsCount: docs.length,
          documents: docs.map(d => ({
            id: d.id,
            title: d.title,
            type: d.type,
            totalPages: d.totalPages,
            updatedAt: d.updatedAt,
          })),
        };
        await manifestWritable.write(JSON.stringify(manifestData, null, 2));
        await manifestWritable.close();

        // Write each document
        for (const doc of docs) {
          const safeTitle = doc.title.replace(/[/\\?%*:|"<>]/g, '_');
          const fileHandle = await flexcilDir.getFileHandle(`${safeTitle}.flexcil.json`, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(JSON.stringify(doc, null, 2));
          await writable.close();
        }

        // Write readable TXT report for Windows Notepad / Explorer
        const reportHandle = await flexcilDir.getFileHandle('LEEME_WINDOWS.txt', { create: true });
        const reportWritable = await reportHandle.createWritable();
        const reportText = `========================================================
FLEXCIL FREE - SINCRONIZACIÓN DE NOTAS CON WINDOWS PC
========================================================
Fecha de sincronización: ${new Date().toLocaleString('es-ES')}
Carpeta de Windows: ${this.state.folderName}
Total documentos respaldados: ${docs.length}

Documentos sincronizados:
${docs.map((d, i) => `${i + 1}. [${d.type.toUpperCase()}] ${d.title} (${d.totalPages} págs)`).join('\n')}

Tus notas están seguras y sincronizadas en tu disco local de Windows.
Puedes transferir esta carpeta a OneDrive, Google Drive o cualquier otro disco.
========================================================`;
        await reportWritable.write(reportText);
        await reportWritable.close();

        this.state.status = 'synced';
        this.state.lastSyncedAt = Date.now();
        this.state.syncedDocsCount = docs.length;
        this.state.lastLog = `Sincronizados ${docs.length} documentos en Windows (${this.state.folderName}/Flexcil_Notas).`;
        this.notify();

        return { success: true, count: docs.length };
      } catch (err: any) {
        console.error('Error during Windows folder sync:', err);
        this.state.status = 'error';
        this.state.lastLog = `Error al escribir en disco de Windows: ${err.message}. Intentando reconectar...`;
        this.notify();
        return { success: false, count: 0, error: err.message };
      }
    } else {
      // If direct folder is not connected, download ZIP backup for Windows
      return { success: false, count: 0, error: 'No hay carpeta de Windows seleccionada' };
    }
  }

  /**
   * Generates and downloads a complete .zip backup containing all documents, notes and drawings
   * that can be saved directly on any Windows PC.
   */
  async exportZipBackupForWindows(): Promise<void> {
    const docs = await flexcilDB.getAllDocuments();
    const zip = new JSZip();

    // Folder for notebooks and notes
    const folder = zip.folder('Flexcil_Documentos_Windows');

    docs.forEach((doc) => {
      const safeTitle = doc.title.replace(/[/\\?%*:|"<>]/g, '_');
      folder?.file(`${safeTitle}.flexcil.json`, JSON.stringify(doc, null, 2));
    });

    const manifest = {
      app: 'Flexcil Free for Windows',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      documentsCount: docs.length,
      device: 'Windows PC & Tablet Companion',
    };
    zip.file('info_respaldo.json', JSON.stringify(manifest, null, 2));

    const readme = `FLEXCIL FREE - RESPALDO COMPLETO PARA WINDOWS
Generado: ${new Date().toLocaleString('es-ES')}
Total de archivos: ${docs.length}

Instrucciones para restaurar en tu PC o navegador:
1. Abre Flexcil en tu navegador o app de Windows.
2. Ve a 'Sincronizar con Windows' > 'Restaurar Respaldo'.
3. Selecciona este archivo .zip o cualquier archivo .flexcil.json individual.`;
    zip.file('LEEME_WINDOWS.txt', readme);

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Flexcil_Respaldo_Windows_${new Date().toISOString().slice(0, 10)}.flexcil.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.state.lastSyncedAt = Date.now();
    this.state.lastLog = `Respaldo ZIP para Windows generado con ${docs.length} documentos.`;
    this.notify();
  }

  /**
   * Imports a backup file (.flexcil.zip or .json) from Windows into Flexcil
   */
  async importBackupFromWindows(file: File): Promise<number> {
    let importedCount = 0;

    if (file.name.endsWith('.zip')) {
      const zip = await JSZip.loadAsync(file);
      const filePromises: Promise<void>[] = [];

      zip.forEach((relativePath, zipEntry) => {
        if (!zipEntry.dir && relativePath.endsWith('.json') && !relativePath.includes('manifest') && !relativePath.includes('info_respaldo')) {
          filePromises.push(
            zipEntry.async('string').then(async (content) => {
              try {
                const doc = JSON.parse(content) as FlexcilDocument;
                if (doc.id && doc.title) {
                  // Ensure unique ID or update existing
                  await flexcilDB.saveDocument(doc);
                  importedCount++;
                }
              } catch (e) {
                console.warn('Skipping invalid JSON file in zip:', relativePath);
              }
            })
          );
        }
      });

      await Promise.all(filePromises);
    } else if (file.name.endsWith('.json')) {
      const text = await file.text();
      const doc = JSON.parse(text) as FlexcilDocument;
      if (doc.id && doc.title) {
        await flexcilDB.saveDocument(doc);
        importedCount = 1;
      }
    }

    this.state.lastLog = `Se importaron ${importedCount} documentos desde Windows.`;
    this.state.syncedDocsCount = (await flexcilDB.getAllDocuments()).length;
    this.notify();

    return importedCount;
  }
}

export const windowsSync = new WindowsSyncService();
