import React, { useState, useEffect } from 'react';
import { FlexcilDocument, FolderItem } from './types';
import { 
  flexcilDB, 
  createInitialSampleDocuments, 
  createInitialFolders 
} from './src/services/db';
import { LibraryView } from './src/components/LibraryView';
import { ReaderWorkspace } from './src/components/ReaderWorkspace';
import { StoreModal } from './src/components/StoreModal';
import { WindowsSyncModal } from './src/components/WindowsSyncModal';
import { NewNotebookModal } from './src/components/NewNotebookModal';
import { MultiDeviceModal } from './src/components/MultiDeviceModal';
import { PWAInstallButton } from './src/components/PWAInstallButton';
import { Radio } from 'lucide-react';

export default function App() {
  const [documents, setDocuments] = useState<FlexcilDocument[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [activeDocument, setActiveDocument] = useState<FlexcilDocument | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [isStoreOpen, setIsStoreOpen] = useState(false);
  const [isWindowsSyncOpen, setIsWindowsSyncOpen] = useState(false);
  const [isNewNotebookOpen, setIsNewNotebookOpen] = useState(false);
  const [isMultiDeviceOpen, setIsMultiDeviceOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load initial data from IndexedDB
  const refreshData = async () => {
    try {
      let docs = await flexcilDB.getAllDocuments();
      let flds = await flexcilDB.getAllFolders();

      // Seed if empty on first boot
      if (docs.length === 0) {
        const seedDocs = createInitialSampleDocuments();
        for (const d of seedDocs) {
          await flexcilDB.saveDocument(d);
        }
        docs = seedDocs;
      }

      if (flds.length === 0) {
        const seedFolders = createInitialFolders();
        for (const f of seedFolders) {
          await flexcilDB.saveFolder(f);
        }
        flds = seedFolders;
      }

      setDocuments(docs);
      setFolders(flds);

      // If active document is open, keep reference fresh
      if (activeDocument) {
        const refreshedActive = docs.find((d) => d.id === activeDocument.id);
        if (refreshedActive) {
          setActiveDocument(refreshedActive);
        }
      }
    } catch (err) {
      console.error('Error loading Flexcil database:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const handleDocumentCreated = (newDoc: FlexcilDocument) => {
    setDocuments((prev) => [newDoc, ...prev]);
    setActiveDocument(newDoc);
    setIsStoreOpen(false);
    setIsNewNotebookOpen(false);
  };

  const handleSaveDocument = (updatedDoc: FlexcilDocument) => {
    setDocuments((prev) => prev.map((d) => (d.id === updatedDoc.id ? updatedDoc : d)));
    setActiveDocument(updatedDoc);
  };

  if (isLoading) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-slate-900 text-white">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-base font-bold">Cargando Paula Notes...</h2>
        <p className="text-xs text-slate-400 mt-1">Inicializando base de datos sin límite de archivo</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-slate-100 font-sans">
      
      {/* Dynamic View: Either Reader Workspace or Library */}
      {activeDocument ? (
        <ReaderWorkspace
          document={activeDocument}
          allDocuments={documents}
          onBackToLibrary={() => {
            setActiveDocument(null);
            refreshData();
          }}
          onOpenWindowsSync={() => setIsWindowsSyncOpen(true)}
          onOpenStore={() => setIsStoreOpen(true)}
          onSaveDocument={handleSaveDocument}
        />
      ) : (
        <div className="h-full flex flex-col">
          {/* Top banner bar with PWA install & Windows sync status */}
          <div className="bg-slate-900 text-slate-300 px-6 py-2 flex items-center justify-between text-xs border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-semibold text-white">Paula Notes v2.5</span>
              <span className="hidden sm:inline text-slate-400">• Tienda Desbloqueada 100% Gratis • Sin Límite de Archivo</span>
            </div>
            <div className="flex items-center gap-3">
              <PWAInstallButton />
              <button
                onClick={() => setIsMultiDeviceOpen(true)}
                className="flex items-center gap-1.5 hover:text-emerald-400 font-medium transition cursor-pointer"
              >
                <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                <span>Multi-Dispositivo</span>
              </button>
              <button
                onClick={() => setIsWindowsSyncOpen(true)}
                className="hover:text-blue-400 font-medium transition cursor-pointer"
              >
                Sync Windows PC
              </button>
            </div>
          </div>

          <LibraryView
            documents={documents}
            folders={folders}
            selectedFolderId={selectedFolderId}
            onSelectFolder={setSelectedFolderId}
            onOpenDocument={(doc) => setActiveDocument(doc)}
            onOpenStore={() => setIsStoreOpen(true)}
            onOpenWindowsSync={() => setIsWindowsSyncOpen(true)}
            onOpenNewNotebook={() => setIsNewNotebookOpen(true)}
            onRefreshData={refreshData}
          />
        </div>
      )}

      {/* Modals */}
      <StoreModal
        isOpen={isStoreOpen}
        onClose={() => setIsStoreOpen(false)}
        onDocumentCreated={handleDocumentCreated}
      />

      <WindowsSyncModal
        isOpen={isWindowsSyncOpen}
        onClose={() => setIsWindowsSyncOpen(false)}
        onRefreshDocs={refreshData}
      />

      <NewNotebookModal
        isOpen={isNewNotebookOpen}
        onClose={() => setIsNewNotebookOpen(false)}
        folders={folders}
        onCreate={handleDocumentCreated}
      />

      <MultiDeviceModal
        isOpen={isMultiDeviceOpen}
        onClose={() => setIsMultiDeviceOpen(false)}
      />

    </div>
  );
}
