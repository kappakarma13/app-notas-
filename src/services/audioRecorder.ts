import { AudioRecordingItem } from '../types';

class AudioRecorderService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private startTime: number = 0;
  private recordingInterval: any = null;
  private isRecording: boolean = false;
  private onTimeUpdateCallback?: (seconds: number) => void;

  public async isSupported(): Promise<boolean> {
    return typeof window !== 'undefined' && 'mediaDevices' in navigator && 'MediaRecorder' in window;
  }

  public async startRecording(onTimeUpdate?: (seconds: number) => void): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];
      this.startTime = Date.now();
      this.isRecording = true;
      this.onTimeUpdateCallback = onTimeUpdate;

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.recordingInterval = setInterval(() => {
        if (this.onTimeUpdateCallback) {
          const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
          this.onTimeUpdateCallback(elapsed);
        }
      }, 500);

      this.mediaRecorder.start(200);
      return true;
    } catch (err) {
      console.error('Error starting audio recording:', err);
      return false;
    }
  }

  public stopRecording(pageNumber: number, title?: string): Promise<AudioRecordingItem | null> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || !this.isRecording) {
        resolve(null);
        return;
      }

      clearInterval(this.recordingInterval);
      this.isRecording = false;
      const durationSeconds = Math.max(1, Math.floor((Date.now() - this.startTime) / 1000));

      this.mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        
        // Stop audio tracks
        this.mediaRecorder?.stream.getTracks().forEach((t) => t.stop());

        // Convert blob to base64 for persistent IndexedDB storage & multi-device sync
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result as string;
          const recordingItem: AudioRecordingItem = {
            id: `audio-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            pageNumber,
            title: title || `Grabación de clase (Pág. ${pageNumber})`,
            audioData: base64data,
            durationSeconds,
            createdAt: Date.now(),
          };
          resolve(recordingItem);
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(audioBlob);
      };

      this.mediaRecorder.stop();
    });
  }

  public getIsRecording(): boolean {
    return this.isRecording;
  }
}

export const audioRecorder = new AudioRecorderService();
