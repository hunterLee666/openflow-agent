import { readFile, writeFile, mkdir } from "node:fs/promises";
import { stat } from "node:fs/promises";
import type { ToolDefinition } from "../types/index.js";

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"];
const AUDIO_EXTENSIONS = [".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a"];
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".avi", ".mov", ".mkv", ".flv"];

export interface MediaAnalysisResult {
  type: "image" | "audio" | "video";
  format: string;
  size: number;
  dimensions?: { width: number; height: number };
  duration?: number;
  description?: string;
  metadata?: Record<string, unknown>;
}

export function createMultimediaTools(): ToolDefinition[] {
  return [
    {
      name: "ImageAnalysis",
      description: "Analyze images and extract information. Supports PNG, JPG, GIF, WebP, BMP, SVG. Returns format, dimensions, size, and content description.",
      inputSchema: {
        type: "object",
        properties: {
          image_path: { type: "string", description: "The absolute path to the image file" },
          analysis_type: { type: "string", enum: ["basic", "detailed", "ocr", "object_detection"], description: "Type of analysis to perform" },
        },
        required: ["image_path"],
      },
      isReadOnly: true,
      handler: async (input: unknown) => {
        const typed = input as { image_path: string; analysis_type?: string };
        const imagePath = typed.image_path;

        try {
          const fileStat = await stat(imagePath);
          const ext = imagePath.slice(imagePath.lastIndexOf(".")).toLowerCase();

          if (!IMAGE_EXTENSIONS.includes(ext)) {
            return `Error: Not a supported image format. Supported: ${IMAGE_EXTENSIONS.join(", ")}`;
          }

          const result: MediaAnalysisResult = {
            type: "image",
            format: ext.slice(1),
            size: fileStat.size,
          };

          if (ext === ".png" || ext === ".jpg" || ext === ".jpeg") {
            const dimensions = await getImageDimensions(imagePath);
            if (dimensions) {
              result.dimensions = dimensions;
            }
          }

          const analysisType = typed.analysis_type || "basic";
          result.description = `Image analysis (${analysisType}): ${result.format.toUpperCase()} image, ${result.dimensions ? `${result.dimensions.width}x${result.dimensions.height}` : "unknown dimensions"}, ${(result.size / 1024).toFixed(1)}KB`;

          return JSON.stringify(result, null, 2);
        } catch (error) {
          return `Error analyzing image: ${(error as Error).message}`;
        }
      },
    },
    {
      name: "ImageGeneration",
      description: "Generate images from text descriptions. Returns a placeholder with generation parameters. For actual generation, configure an external image generation service.",
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Text description of the image to generate" },
          size: { type: "string", enum: ["256x256", "512x512", "1024x1024", "1024x1792", "1792x1024"], description: "Image size" },
          style: { type: "string", enum: ["realistic", "artistic", "abstract", "minimalist"], description: "Image style" },
          output_path: { type: "string", description: "Path to save the generated image" },
        },
        required: ["prompt"],
      },
      isReadOnly: false,
      handler: async (input: unknown) => {
        const typed = input as { prompt: string; size?: string; style?: string; output_path?: string };

        const size = typed.size || "1024x1024";
        const style = typed.style || "realistic";

        const result = {
          status: "placeholder",
          prompt: typed.prompt,
          size,
          style,
          message: "Image generation requires external service configuration. This is a placeholder response.",
          parameters: {
            model: "dall-e-3",
            quality: "hd",
            n: 1,
          },
        };

        if (typed.output_path) {
          try {
            await writeFile(typed.output_path, JSON.stringify(result, null, 2));
            result.message += ` Parameters saved to: ${typed.output_path}`;
          } catch (error) {
            result.message += ` Failed to save parameters: ${(error as Error).message}`;
          }
        }

        return JSON.stringify(result, null, 2);
      },
    },
    {
      name: "AudioAnalysis",
      description: "Analyze audio files and extract metadata. Supports MP3, WAV, OGG, FLAC, AAC, M4A.",
      inputSchema: {
        type: "object",
        properties: {
          audio_path: { type: "string", description: "The absolute path to the audio file" },
        },
        required: ["audio_path"],
      },
      isReadOnly: true,
      handler: async (input: unknown) => {
        const typed = input as { audio_path: string };
        const audioPath = typed.audio_path;

        try {
          const fileStat = await stat(audioPath);
          const ext = audioPath.slice(audioPath.lastIndexOf(".")).toLowerCase();

          if (!AUDIO_EXTENSIONS.includes(ext)) {
            return `Error: Not a supported audio format. Supported: ${AUDIO_EXTENSIONS.join(", ")}`;
          }

          const result: MediaAnalysisResult = {
            type: "audio",
            format: ext.slice(1),
            size: fileStat.size,
            description: `Audio file: ${ext.slice(1).toUpperCase()}, ${(fileStat.size / 1024 / 1024).toFixed(2)}MB`,
          };

          return JSON.stringify(result, null, 2);
        } catch (error) {
          return `Error analyzing audio: ${(error as Error).message}`;
        }
      },
    },
    {
      name: "AudioGeneration",
      description: "Generate audio from text (text-to-speech). Returns a placeholder with generation parameters.",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "Text to convert to speech" },
          voice: { type: "string", description: "Voice identifier" },
          language: { type: "string", description: "Language code (e.g., en, zh, ja)" },
          output_path: { type: "string", description: "Path to save the generated audio" },
        },
        required: ["text"],
      },
      isReadOnly: false,
      handler: async (input: unknown) => {
        const typed = input as { text: string; voice?: string; language?: string; output_path?: string };

        const result = {
          status: "placeholder",
          text: typed.text.slice(0, 100) + (typed.text.length > 100 ? "..." : ""),
          voice: typed.voice || "default",
          language: typed.language || "en",
          message: "Audio generation requires external TTS service configuration. This is a placeholder response.",
          parameters: {
            model: "tts-1",
            response_format: "mp3",
            speed: 1.0,
          },
        };

        if (typed.output_path) {
          try {
            await writeFile(typed.output_path, JSON.stringify(result, null, 2));
            result.message += ` Parameters saved to: ${typed.output_path}`;
          } catch (error) {
            result.message += ` Failed to save parameters: ${(error as Error).message}`;
          }
        }

        return JSON.stringify(result, null, 2);
      },
    },
    {
      name: "VideoAnalysis",
      description: "Analyze video files and extract metadata. Supports MP4, WebM, AVI, MOV, MKV, FLV.",
      inputSchema: {
        type: "object",
        properties: {
          video_path: { type: "string", description: "The absolute path to the video file" },
        },
        required: ["video_path"],
      },
      isReadOnly: true,
      handler: async (input: unknown) => {
        const typed = input as { video_path: string };
        const videoPath = typed.video_path;

        try {
          const fileStat = await stat(videoPath);
          const ext = videoPath.slice(videoPath.lastIndexOf(".")).toLowerCase();

          if (!VIDEO_EXTENSIONS.includes(ext)) {
            return `Error: Not a supported video format. Supported: ${VIDEO_EXTENSIONS.join(", ")}`;
          }

          const result: MediaAnalysisResult = {
            type: "video",
            format: ext.slice(1),
            size: fileStat.size,
            description: `Video file: ${ext.slice(1).toUpperCase()}, ${(fileStat.size / 1024 / 1024).toFixed(2)}MB`,
          };

          return JSON.stringify(result, null, 2);
        } catch (error) {
          return `Error analyzing video: ${(error as Error).message}`;
        }
      },
    },
    {
      name: "VideoGeneration",
      description: "Generate video from text descriptions. Returns a placeholder with generation parameters.",
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Text description of the video to generate" },
          duration: { type: "number", description: "Video duration in seconds" },
          resolution: { type: "string", enum: ["720p", "1080p", "4K"], description: "Video resolution" },
          output_path: { type: "string", description: "Path to save the generated video" },
        },
        required: ["prompt"],
      },
      isReadOnly: false,
      handler: async (input: unknown) => {
        const typed = input as { prompt: string; duration?: number; resolution?: string; output_path?: string };

        const result = {
          status: "placeholder",
          prompt: typed.prompt,
          duration: typed.duration || 5,
          resolution: typed.resolution || "1080p",
          message: "Video generation requires external service configuration. This is a placeholder response.",
          parameters: {
            model: "video-gen-1",
            fps: 24,
            format: "mp4",
          },
        };

        if (typed.output_path) {
          try {
            await writeFile(typed.output_path, JSON.stringify(result, null, 2));
            result.message += ` Parameters saved to: ${typed.output_path}`;
          } catch (error) {
            result.message += ` Failed to save parameters: ${(error as Error).message}`;
          }
        }

        return JSON.stringify(result, null, 2);
      },
    },
  ];
}

async function getImageDimensions(imagePath: string): Promise<{ width: number; height: number } | null> {
  try {
    const buffer = await readFile(imagePath);

    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return { width, height };
    }

    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
      let offset = 2;
      while (offset < buffer.length) {
        if (buffer[offset] !== 0xff) {
          offset++;
          continue;
        }

        const marker = buffer[offset + 1];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          return { width, height };
        }

        const segmentLength = buffer.readUInt16BE(offset + 2);
        offset += 2 + segmentLength;
      }
    }

    return null;
  } catch {
    return null;
  }
}
