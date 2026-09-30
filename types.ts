export type ToolType = 'pen' | 'highlighter' | 'eraser' | 'lasso' | 'shape' | 'text' | 'image' | 'clipper' | 'sticker' | 'pan';

export type ShapeType = 'rectangle' | 'circle' | 'line' | 'arrow' | 'triangle';

export type PaperTemplate = 
  | 'blank' 
  | 'lined' 
  | 'grid' 
  | 'dotted' 
  | 'cornell' 
  | 'hexagonal' 
  | 'music' 
  | 'planner-daily' 
  | 'planner-weekly' 
  | 'dark-grid' 
  | 'dark-dotted' 
  | 'dark-lined';

export interface StrokePoint {
  x: number;
  y: number;
  pressure?: number;
}

export interface StrokeItem {
  id: string;
  tool: 'pen' | 'highlighter';
  color: string;
  width: number;
  opacity: number;
  points: StrokePoint[];
}

export interface ShapeItem {
  id: string;
  shape: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor: string;
  strokeWidth: number;
  fillColor?: string;
}

export interface TextNoteItem {
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
  backgroundColor?: string;
  width?: number;
}

export interface ClippingItem {
  id: string;
  sourceDocId: string;
  sourceDocTitle: string;
  sourcePageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  imageUrl: string;
  label?: string;
  createdAt: number;
}

export interface StickerItem {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  emoji?: string;
  imageUrl?: string;
  title: string;
}

export interface ImageItem {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  dataUrl: string;
  title?: string;
}

export interface AudioRecordingItem {
  id: string;
  pageNumber: number;
  title: string;
  audioData: string; // base64 data url
  durationSeconds: number;
  createdAt: number;
}

export interface PageData {
  pageNumber: number;
  strokes: StrokeItem[];
  shapes: ShapeItem[];
  textNotes: TextNoteItem[];
  clippings: ClippingItem[];
  stickers: StickerItem[];
  images?: ImageItem[];
  audioNotes?: AudioRecordingItem[];
  bookmark?: boolean;
  notesSummary?: string;
}

export interface FlexcilDocument {
  id: string;
  title: string;
  type: 'pdf' | 'notebook';
  totalPages: number;
  currentPage: number;
  createdAt: number;
  updatedAt: number;
  folderId?: string;
  paperTemplate: PaperTemplate;
  coverColor: string;
  coverStyle: string;
  tags: string[];
  pdfDataBlob?: Blob | ArrayBuffer | string; // Store raw PDF for unlimited viewing
  pdfFileName?: string;
  fileSizeBytes?: number;
  thumbnailDataUrl?: string;
  pdfPageLayout?: 'single' | 'two-page' | 'continuous';
  readingTheme?: 'normal' | 'sepia' | 'dark' | 'soft-gray' | 'eye-care';
  workspaceBg?: 'dark' | 'light' | 'sepia' | 'slate' | 'warm';
  pages: Record<number, PageData>; // 1-indexed
  isFavorite?: boolean;
}

export interface FolderItem {
  id: string;
  name: string;
  color: string;
  icon?: string;
  createdAt: number;
}

export interface StoreTemplateItem {
  id: string;
  title: string;
  category: 'planners' | 'notebooks' | 'covers' | 'stickers' | 'papers';
  description: string;
  paperTemplate?: PaperTemplate;
  coverColor?: string;
  coverStyle?: string;
  previewGradient: string;
  tag: string;
  downloadsCount: number;
  rating: number;
  stickers?: Array<{ emoji: string; title: string; category: string }>;
  isFreeAlways: true;
  features: string[];
}

export interface WindowsSyncState {
  isConnected: boolean;
  folderName: string | null;
  lastSyncedAt: number | null;
  autoSync: boolean;
  status: 'idle' | 'syncing' | 'synced' | 'error';
  lastLog?: string;
  syncedDocsCount: number;
}

export interface DevicePeer {
  id: string;
  name: string;
  deviceType: 'windows' | 'tablet' | 'phone' | 'mac' | 'browser';
  color: string;
  activeDocId?: string;
  activePage?: number;
  lastActive: number;
}

export interface AISchemaAnalysisRequest {
  documentTitle: string;
  mode: 'schema' | 'summary' | 'flashcards' | 'quiz' | 'mindmap';
  targetPagesText: string;
  pageRangeDesc: string;
  userCustomPrompt?: string;
}

export interface AISchemaAnalysisResponse {
  title: string;
  summary: string;
  markdownContent: string;
  outlineNodes?: Array<{
    title: string;
    subitems: string[];
    color?: string;
  }>;
  keyConcepts?: Array<{ term: string; definition: string }>;
  flashcards?: Array<{ front: string; back: string }>;
  quizQuestions?: Array<{ question: string; options: string[]; answerIndex: number; explanation: string }>;
}
