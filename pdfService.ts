import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PaperTemplate } from '../types';

// Configure pdfjs worker via Vite
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
}

// In-memory cache of loaded PDF documents & ArrayBuffers
const pdfDocumentCache = new Map<string, any>();
const pdfBinaryCache = new Map<string, ArrayBuffer>();

export function storePdfBinaryInMemory(docId: string, buffer: ArrayBuffer) {
  pdfBinaryCache.set(docId, buffer);
}

export function getPdfBinaryFromMemory(docId: string): ArrayBuffer | undefined {
  return pdfBinaryCache.get(docId);
}

/**
 * Generates an image thumbnail data URL from page 1 of a PDF document
 */
export async function renderPdfThumbnail(pdfDocument: any, scale: number = 0.45): Promise<string | null> {
  if (!pdfDocument || typeof document === 'undefined') return null;
  try {
    const page = await pdfDocument.getPage(1);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    await page.render({
      canvasContext: ctx,
      viewport,
    }).promise;
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch (err) {
    console.warn('Could not generate PDF thumbnail:', err);
    return null;
  }
}

/**
 * Loads a PDF file and returns its metadata + total pages + generated thumbnail
 */
export async function loadPdfMetadata(fileOrBlobOrBuffer: Blob | ArrayBuffer): Promise<{
  totalPages: number;
  pdfDocument: any;
  arrayBuffer: ArrayBuffer;
  thumbnailDataUrl?: string;
}> {
  try {
    const arrayBuffer = fileOrBlobOrBuffer instanceof Blob 
      ? await fileOrBlobOrBuffer.arrayBuffer() 
      : fileOrBlobOrBuffer;

    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      cMapPacked: true,
    });
    const pdfDoc = await loadingTask.promise;
    const thumbnailDataUrl = await renderPdfThumbnail(pdfDoc);
    return {
      totalPages: pdfDoc.numPages,
      pdfDocument: pdfDoc,
      arrayBuffer,
      thumbnailDataUrl: thumbnailDataUrl || undefined,
    };
  } catch (error) {
    console.warn('PDF.js metadata load error:', error);
    const arrayBuffer = fileOrBlobOrBuffer instanceof Blob 
      ? await fileOrBlobOrBuffer.arrayBuffer() 
      : fileOrBlobOrBuffer;
    return {
      totalPages: 10,
      pdfDocument: null,
      arrayBuffer,
    };
  }
}

/**
 * Retrieves a cached or freshly loads a PDF document instance for viewing
 */
export async function getOrLoadPdfDocument(
  docId: string, 
  pdfData?: Blob | ArrayBuffer | string
): Promise<any | null> {
  if (pdfDocumentCache.has(docId)) {
    return pdfDocumentCache.get(docId);
  }

  let arrayBuffer: ArrayBuffer | undefined = pdfBinaryCache.get(docId);

  if (!arrayBuffer && pdfData) {
    if (pdfData instanceof ArrayBuffer) {
      arrayBuffer = pdfData;
    } else if (pdfData instanceof Blob) {
      arrayBuffer = await pdfData.arrayBuffer();
    } else if (typeof pdfData === 'string' && pdfData.startsWith('data:')) {
      const res = await fetch(pdfData);
      arrayBuffer = await res.arrayBuffer();
    }
  }

  if (!arrayBuffer) {
    return null;
  }

  try {
    pdfBinaryCache.set(docId, arrayBuffer);
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      cMapPacked: true,
    });
    const pdfDoc = await loadingTask.promise;
    pdfDocumentCache.set(docId, pdfDoc);
    return pdfDoc;
  } catch (err) {
    console.error('Failed to load PDF with pdfjs:', err);
    return null;
  }
}

/**
 * Renders a specific page of a PDF document onto an HTML Canvas with HiDPI crispness
 */
export async function renderPdfPageToCanvas(
  pdfDocument: any,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale: number = 2.0
): Promise<{ 
  width: number; 
  height: number; 
  originalWidth: number; 
  originalHeight: number; 
  success: boolean 
}> {
  if (!pdfDocument) {
    return { width: 850, height: 1150, originalWidth: 850, originalHeight: 1150, success: false };
  }

  try {
    const page = await pdfDocument.getPage(pageNumber);
    const naturalViewport = page.getViewport({ scale: 1.0 });
    const viewport = page.getViewport({ scale });

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return { 
      width: viewport.width, 
      height: viewport.height, 
      originalWidth: naturalViewport.width, 
      originalHeight: naturalViewport.height, 
      success: false 
    };

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const renderContext = {
      canvasContext: ctx,
      viewport: viewport,
    };

    await page.render(renderContext).promise;
    return { 
      width: viewport.width, 
      height: viewport.height, 
      originalWidth: naturalViewport.width, 
      originalHeight: naturalViewport.height, 
      success: true 
    };
  } catch (err) {
    console.error(`Error rendering PDF page ${pageNumber}:`, err);
    return { width: 850, height: 1150, originalWidth: 850, originalHeight: 1150, success: false };
  }
}

/**
 * Extracts real text content from a page for AI analysis / mindmaps
 */
export async function extractTextFromPdfPage(pdfDocument: any, pageNumber: number): Promise<string> {
  if (!pdfDocument) return '';
  try {
    const page = await pdfDocument.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const strings = textContent.items.map((item: any) => item.str || '');
    return strings.join(' ').replace(/\s+/g, ' ').trim();
  } catch (err) {
    console.warn(`Could not extract text from PDF page ${pageNumber}:`, err);
    return '';
  }
}

/**
 * Renders paper patterns (Cornell, Grid, Lined, Dotted, Hexagonal, Music, Planners)
 * on a canvas with pristine vector quality.
 */
export function drawPaperBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  template: PaperTemplate
) {
  const isDark = template.startsWith('dark-');

  // Base background
  ctx.fillStyle = isDark ? '#0f172a' : '#ffffff';
  ctx.fillRect(0, 0, width, height);

  ctx.save();

  if (template === 'lined' || template === 'dark-lined') {
    const lineSpacing = 32;
    const topMargin = 70;
    const leftMargin = 70;

    // Red left margin line
    ctx.strokeStyle = isDark ? '#ef4444' : '#f87171';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(leftMargin, 0);
    ctx.lineTo(leftMargin, height);
    ctx.stroke();

    // Horizontal lines
    ctx.strokeStyle = isDark ? '#334155' : '#e2e8f0';
    ctx.lineWidth = 1;
    for (let y = topMargin; y < height - 30; y += lineSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  } else if (template === 'grid' || template === 'dark-grid') {
    const gridSize = 24;
    ctx.strokeStyle = isDark ? '#1e293b' : '#e2e8f0';
    ctx.lineWidth = 0.75;

    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  } else if (template === 'dotted' || template === 'dark-dotted') {
    const dotSpacing = 24;
    ctx.fillStyle = isDark ? '#475569' : '#cbd5e1';
    const radius = 1.2;

    for (let x = dotSpacing; x < width - 10; x += dotSpacing) {
      for (let y = dotSpacing; y < height - 10; y += dotSpacing) {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (template === 'cornell') {
    // Cornell study layout
    const cueWidth = width * 0.28;
    const summaryHeight = height * 0.18;
    const headerHeight = 70;

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, headerHeight);
    ctx.lineTo(width, headerHeight);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cueWidth, headerHeight);
    ctx.lineTo(cueWidth, height - summaryHeight);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, height - summaryHeight);
    ctx.lineTo(width, height - summaryHeight);
    ctx.stroke();

    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    for (let y = headerHeight + 28; y < height - summaryHeight; y += 28) {
      ctx.beginPath();
      ctx.moveTo(cueWidth, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('FECHA / TEMA DE ESTUDIO', 24, 40);
    ctx.fillText('PALABRAS CLAVE / PREGUNTAS (CUES)', 20, headerHeight + 30);
    ctx.fillText('APUNTES PRINCIPALES', cueWidth + 20, headerHeight + 30);
    ctx.fillText('RESUMEN / SÍNTESIS FINAL', 24, height - summaryHeight + 28);
  } else if (template === 'hexagonal') {
    const size = 18;
    const hexHeight = size * Math.sqrt(3);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 0.8;

    for (let y = 30; y < height - 20; y += hexHeight * 1.5) {
      for (let x = 30; x < width - 20; x += size * 3) {
        drawHexagon(ctx, x, y, size);
        drawHexagon(ctx, x + size * 1.5, y + hexHeight * 0.75, size);
      }
    }
  } else if (template === 'music') {
    const staffMargin = 80;
    const lineGap = 10;
    const staffGap = 70;
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;

    for (let top = staffMargin; top < height - staffMargin; top += 4 * lineGap + staffGap) {
      for (let i = 0; i < 5; i++) {
        const y = top + i * lineGap;
        ctx.beginPath();
        ctx.moveTo(50, y);
        ctx.lineTo(width - 50, y);
        ctx.stroke();
      }
      ctx.fillStyle = '#64748b';
      ctx.font = '24px serif';
      ctx.fillText('𝄞', 55, top + 34);
    }
  } else if (template === 'planner-daily') {
    drawDailyPlanner(ctx, width, height);
  } else if (template === 'planner-weekly') {
    drawWeeklyPlanner(ctx, width, height);
  }

  ctx.restore();
}

function drawHexagon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    const hx = x + r * Math.cos(angle);
    const hy = y + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(hx, hy);
    else ctx.lineTo(hx, hy);
  }
  ctx.closePath();
  ctx.stroke();
}

function drawDailyPlanner(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('PLANIFICADOR DIARIO', 36, 45);

  ctx.fillStyle = '#64748b';
  ctx.font = '12px sans-serif';
  ctx.fillText('FECHA: ____/____/2026', width - 200, 45);

  const leftW = width * 0.45;
  ctx.strokeRect(36, 70, leftW - 36, height - 120);

  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('HORARIO & CITAS', 50, 95);

  ctx.strokeStyle = '#e2e8f0';
  for (let h = 7; h <= 21; h++) {
    const y = 120 + (h - 7) * 36;
    ctx.fillStyle = '#64748b';
    ctx.font = '11px sans-serif';
    ctx.fillText(`${h < 10 ? '0' + h : h}:00`, 45, y + 4);
    ctx.beginPath();
    ctx.moveTo(85, y);
    ctx.lineTo(leftW - 10, y);
    ctx.stroke();
  }

  const rightX = leftW + 20;
  const rightW = width - rightX - 36;

  ctx.strokeStyle = '#cbd5e1';
  ctx.strokeRect(rightX, 70, rightW, 180);
  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('🎯 3 PRIORIDADES DEL DÍA', rightX + 16, 95);

  for (let i = 1; i <= 3; i++) {
    const y = 100 + i * 36;
    ctx.strokeRect(rightX + 16, y - 14, 18, 18);
    ctx.strokeStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(rightX + 44, y);
    ctx.lineTo(rightX + rightW - 20, y);
    ctx.stroke();
    ctx.strokeStyle = '#cbd5e1';
  }

  const todoY = 270;
  ctx.strokeRect(rightX, todoY, rightW, height - todoY - 50);
  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('✅ LISTA DE TAREAS & APUNTES', rightX + 16, todoY + 28);

  ctx.strokeStyle = '#e2e8f0';
  for (let y = todoY + 55; y < height - 70; y += 32) {
    ctx.strokeRect(rightX + 16, y - 12, 16, 16);
    ctx.beginPath();
    ctx.moveTo(rightX + 40, y);
    ctx.lineTo(rightX + rightW - 20, y);
    ctx.stroke();
  }
}

function drawWeeklyPlanner(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('PLANIFICADOR SEMANAL DE ESTUDIO', 36, 45);

  const days = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO / DOMINGO', 'OBJETIVOS'];
  const colW = (width - 72) / 2;
  const rowH = (height - 90) / 4;

  for (let i = 0; i < 7; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 36 + col * colW;
    const y = 70 + row * rowH;

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, colW - 12, rowH - 12);

    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(x, y, colW - 12, 28);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(days[i], x + 12, y + 19);

    ctx.strokeStyle = '#f1f5f9';
    for (let ly = y + 54; ly < y + rowH - 20; ly += 24) {
      ctx.beginPath();
      ctx.moveTo(x + 10, ly);
      ctx.lineTo(x + colW - 22, ly);
      ctx.stroke();
    }
  }
}
