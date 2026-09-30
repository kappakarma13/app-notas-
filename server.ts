import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));

// Initialize Google Gen AI
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// AI Route for Esquemas & Resúmenes por páginas
app.post('/api/ai/analyze', async (req, res) => {
  try {
    const { documentTitle, mode, targetPagesText, pageRangeDesc, userCustomPrompt } = req.body;

    if (!ai) {
      // Fallback response if GEMINI_API_KEY is not configured yet
      return res.json({
        title: `Esquema y Resumen de ${documentTitle || 'Documento'}`,
        summary: `Análisis generado para ${pageRangeDesc || 'las páginas seleccionadas'}:\n\n1. Concepto Principal: Fundamentos y conceptos centrales extraídos del documento.\n2. Puntos Clave: Los elementos destacados se organizan de forma jerárquica para facilitar el estudio.\n3. Aplicación Práctica: Ideal para repasar antes de exámenes y asimilar fórmulas o definiciones.`,
        markdownContent: `### 📌 Esquema de Estudio (${pageRangeDesc || 'Páginas Seleccionadas'})\n\n- **Tema Central**: ${documentTitle}\n  - **Sección 1: Definiciones Clave**\n    - Comprensión de conceptos fundamentales.\n    - Relación con casos prácticos.\n  - **Sección 2: Desarrollo y Metodología**\n    - Pasos de análisis y síntesis.\n    - Puntos críticos para examen.\n  - **Sección 3: Conclusiones**\n    - Síntesis de aprendizaje y recordatorios clave.`,
        outlineNodes: [
          {
            title: 'Conceptos Fundamentales',
            subitems: ['Definición básica y alcance', 'Terminología obligatoria para examen', 'Ejemplos contextuales'],
            color: '#3b82f6',
          },
          {
            title: 'Desarrollo & Relaciones',
            subitems: ['Conexión entre capítulos', 'Fórmulas y diagramas clave', 'Reglas y excepciones'],
            color: '#8b5cf6',
          },
          {
            title: 'Síntesis & Mnemotecnia',
            subitems: ['Palabras clave Cornell', 'Preguntas frecuentes de test', 'Resumen en 3 frases'],
            color: '#10b981',
          },
        ],
        keyConcepts: [
          { term: 'Concepto Clave 1', definition: 'Principio esencial documentado en las páginas analizadas.' },
          { term: 'Concepto Clave 2', definition: 'Mecanismo o proceso relevante para la comprensión del tema.' },
          { term: 'Concepto Clave 3', definition: 'Conclusión y resultado directo del estudio.' },
        ],
        flashcards: [
          { front: `¿Cuál es el objetivo principal de ${pageRangeDesc}?`, back: 'Comprender los conceptos teóricos y su aplicación práctica.' },
          { front: '¿Qué término define el proceso central explicado?', back: 'La interconexión estructurada de los elementos analizados.' },
        ],
        quizQuestions: [
          {
            question: `Según lo expuesto en ${pageRangeDesc}, ¿cuál es la premisa más importante?`,
            options: ['La estructura coordinada del sistema', 'La falta de relación entre elementos', 'Un proceso puramente aislado', 'Ninguna de las anteriores'],
            answerIndex: 0,
            explanation: 'El texto enfatiza la organización armónica y jerárquica de los componentes.',
          },
        ],
      });
    }

    const systemPrompt = `Eres un asistente pedagógico de élite integrado en Flexcil, la app de estudio y toma de notas.
Tu tarea es analizar el contenido de un documento/PDF (específicamente ${pageRangeDesc}) y generar un esquema interactivo, resumen de estudio de alto rendimiento, o tarjetas de memorización según el modo solicitado: "${mode}".

Debes responder SIEMPRE en formato JSON válido con la siguiente estructura exacta:
{
  "title": "Título conciso y descriptivo",
  "summary": "Resumen ejecutivo claro y pedagógico (en 2-3 párrafos)",
  "markdownContent": "Resumen formateado en Markdown estructurado con viñetas, negritas y llamadas de atención",
  "outlineNodes": [
    { "title": "Nombre de Rama Principal", "subitems": ["Subconcepto 1", "Subconcepto 2"], "color": "#hex" }
  ],
  "keyConcepts": [
    { "term": "Término", "definition": "Definición breve" }
  ],
  "flashcards": [
    { "front": "Pregunta de estudio", "back": "Respuesta concisa" }
  ],
  "quizQuestions": [
    { "question": "¿Pregunta?", "options": ["Opción A", "Opción B", "Opción C", "Opción D"], "answerIndex": 0, "explanation": "Por qué es correcta" }
  ]
}`;

    const userPrompt = `Documento: "${documentTitle}"
Páginas analizadas: ${pageRangeDesc}
Modo solicitado: ${mode}
Instrucción adicional del usuario: ${userCustomPrompt || 'Ninguna'}

Contenido / Notas / Texto de las páginas:
${targetPagesText || 'El usuario está estudiando este capítulo y necesita un esquema estructurado de las páginas para memorizar y sintetizar.'}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }
      ],
      config: {
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text || '{}';
    let parsedData;
    try {
      parsedData = JSON.parse(responseText);
    } catch {
      // Fallback parse if wrapped in markdown blocks
      const clean = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      parsedData = JSON.parse(clean);
    }

    res.json(parsedData);
  } catch (err: any) {
    console.error('Error generating AI study schema:', err);
    res.status(500).json({ error: err.message || 'Error al generar análisis con Gemini' });
  }
});

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket Server for Real-Time Multi-Device Collaboration
const wss = new WebSocketServer({ server, path: '/ws' });

// Store connected clients with metadata
const connectedClients = new Map<WebSocket, { id: string; deviceName: string; deviceType: string; color: string; roomId: string }>();

wss.on('connection', (ws: WebSocket, req) => {
  const clientId = `client-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const defaultMeta = {
    id: clientId,
    deviceName: 'Dispositivo',
    deviceType: 'browser',
    color: '#3b82f6',
    roomId: 'global_study_room',
  };
  connectedClients.set(ws, defaultMeta);

  // Send welcome & peer count
  ws.send(JSON.stringify({
    type: 'CONNECTED',
    clientId,
    peerCount: connectedClients.size,
  }));

  // Broadcast peer joined
  broadcastToRoom(ws, defaultMeta.roomId, {
    type: 'PEER_JOINED',
    peer: { ...defaultMeta, id: clientId },
    peerCount: connectedClients.size,
  });

  ws.on('message', (messageRaw: string) => {
    try {
      const data = JSON.parse(messageRaw.toString());
      const currentMeta = connectedClients.get(ws);

      if (data.type === 'IDENTIFY') {
        if (currentMeta) {
          currentMeta.deviceName = data.deviceName || currentMeta.deviceName;
          currentMeta.deviceType = data.deviceType || currentMeta.deviceType;
          currentMeta.color = data.color || currentMeta.color;
          currentMeta.roomId = data.roomId || currentMeta.roomId;
        }
        // Broadcast updated peers list
        broadcastPeersList(currentMeta?.roomId || 'global_study_room');
      } else if (data.type === 'DOC_UPDATE' || data.type === 'STROKE_DRAW' || data.type === 'PAGE_CHANGE' || data.type === 'AUDIO_SYNC' || data.type === 'IMAGE_PASTE') {
        // Broadcast change to other devices in the same workspace room
        broadcastToRoom(ws, currentMeta?.roomId || 'global_study_room', {
          ...data,
          senderId: clientId,
          senderName: currentMeta?.deviceName,
          senderDevice: currentMeta?.deviceType,
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      console.error('Error handling WebSocket message:', err);
    }
  });

  ws.on('close', () => {
    const meta = connectedClients.get(ws);
    connectedClients.delete(ws);
    if (meta) {
      broadcastToRoom(null, meta.roomId, {
        type: 'PEER_LEFT',
        peerId: clientId,
        peerCount: connectedClients.size,
      });
    }
  });
});

function broadcastToRoom(senderWs: WebSocket | null, roomId: string, payload: any) {
  const msgString = JSON.stringify(payload);
  connectedClients.forEach((meta, client) => {
    if (client !== senderWs && client.readyState === WebSocket.OPEN && meta.roomId === roomId) {
      client.send(msgString);
    }
  });
}

function broadcastPeersList(roomId: string) {
  const peers: any[] = [];
  connectedClients.forEach((meta) => {
    if (meta.roomId === roomId) {
      peers.push(meta);
    }
  });
  const msg = JSON.stringify({ type: 'PEERS_LIST', peers, peerCount: peers.length });
  connectedClients.forEach((meta, client) => {
    if (client.readyState === WebSocket.OPEN && meta.roomId === roomId) {
      client.send(msg);
    }
  });
}

// Development vs Production setup
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(Number(port), '0.0.0.0', () => {
    console.log(`Flexcil Server with Multi-Device WebSockets & Gemini AI running on port ${port}`);
  });
}

startServer();
