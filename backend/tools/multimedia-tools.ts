import { z } from "zod";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { stat } from "node:fs/promises";
import type { ToolDefinition } from "../types/index.js";
import { createReadOnlyTool, createWriteTool } from "./tool-factory.js";

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"];
const AUDIO_EXTENSIONS = [".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a"];
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".avi", ".mov", ".mkv", ".flv"];

const ImageAnalysisInputSchema = z.object({
  image_path: z.string().min(1, "image_path 不能为空"),
  analysis_type: z.enum(["basic", "detailed", "ocr", "object_detection"]).optional(),
});

const ImageGenerationInputSchema = z.object({
  prompt: z.string().min(1, "prompt 不能为空"),
  size: z.enum(["256x256", "512x512", "1024x1024", "1024x1792", "1792x1024"]).optional(),
  style: z.enum(["realistic", "artistic", "abstract", "minimalist"]).optional(),
  output_path: z.string().optional(),
});

const AudioAnalysisInputSchema = z.object({
  audio_path: z.string().min(1, "audio_path 不能为空"),
});

const AudioGenerationInputSchema = z.object({
  text: z.string().min(1, "text 不能为空"),
  voice: z.string().optional(),
  language: z.string().optional(),
  output_path: z.string().optional(),
});

const VideoAnalysisInputSchema = z.object({
  video_path: z.string().min(1, "video_path 不能为空"),
});

const VideoGenerationInputSchema = z.object({
  prompt: z.string().min(1, "prompt 不能为空"),
  duration: z.number().positive().optional(),
  resolution: z.enum(["720p", "1080p", "4K"]).optional(),
  output_path: z.string().optional(),
});

const MediaAnalysisOutputSchema = z.object({
  type: z.enum(["image", "audio", "video"]),
  format: z.string(),
  size: z.number().int().nonnegative(),
  dimensions: z.object({ width: z.number(), height: z.number() }).optional(),
  duration: z.number().optional(),
  description: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const GenerationOutputSchema = z.object({
  status: z.string(),
  message: z.string(),
  parameters: z.record(z.unknown()),
  outputPath: z.string().optional(),
});

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
  const imageAnalysisTool = createReadOnlyTool({
    name: "ImageAnalysis",
    description: "Analyze images and extract information. Supports PNG, JPG, GIF, WebP, BMP, SVG. Returns format, dimensions, size, and content description.",
    inputSchema: ImageAnalysisInputSchema,
    outputSchema: MediaAnalysisOutputSchema,
    handler: async (input) => {
      const imagePath = input.image_path;

      const fileStat = await stat(imagePath);
      const ext = imagePath.slice(imagePath.lastIndexOf(".")).toLowerCase();

      if (!IMAGE_EXTENSIONS.includes(ext)) {
        throw new Error(`Not a supported image format. Supported: ${IMAGE_EXTENSIONS.join(", ")}`);
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

      const analysisType = input.analysis_type || "basic";
      result.description = `Image analysis (${analysisType}): ${result.format.toUpperCase()} image, ${result.dimensions ? `${result.dimensions.width}x${result.dimensions.height}` : "unknown dimensions"}, ${(result.size / 1024).toFixed(1)}KB`;

      return result;
    },
  });

  const imageGenerationTool = createWriteTool({
    name: "ImageGeneration",
    description: "Generate images from text descriptions. Returns a placeholder with generation parameters. For actual generation, configure an external image generation service.",
    inputSchema: ImageGenerationInputSchema,
    outputSchema: GenerationOutputSchema,
    handler: async (input) => {
      const size = input.size || "1024x1024";
      const style = input.style || "realistic";

      const result = {
        status: "placeholder",
        prompt: input.prompt,
        size,
        style,
        message: "Image generation requires external service configuration. This is a placeholder response.",
        parameters: {
          model: "dall-e-3",
          quality: "hd",
          n: 1,
        },
      };

      if (input.output_path) {
        await writeFile(input.output_path, JSON.stringify(result, null, 2));
        result.message += ` Parameters saved to: ${input.output_path}`;
      }

      return {
        status: result.status,
        message: result.message,
        parameters: result.parameters,
        outputPath: input.output_path,
      };
    },
  });

  const audioAnalysisTool = createReadOnlyTool({
    name: "AudioAnalysis",
    description: "Analyze audio files and extract metadata. Supports MP3, WAV, OGG, FLAC, AAC, M4A.",
    inputSchema: AudioAnalysisInputSchema,
    outputSchema: MediaAnalysisOutputSchema,
    handler: async (input) => {
      const audioPath = input.audio_path;

      const fileStat = await stat(audioPath);
      const ext = audioPath.slice(audioPath.lastIndexOf(".")).toLowerCase();

      if (!AUDIO_EXTENSIONS.includes(ext)) {
        throw new Error(`Not a supported audio format. Supported: ${AUDIO_EXTENSIONS.join(", ")}`);
      }

      const result: MediaAnalysisResult = {
        type: "audio",
        format: ext.slice(1),
        size: fileStat.size,
        description: `Audio file: ${ext.slice(1).toUpperCase()}, ${(fileStat.size / 1024 / 1024).toFixed(2)}MB`,
      };

      return result;
    },
  });

  const audioGenerationTool = createWriteTool({
    name: "AudioGeneration",
    description: "Generate audio from text (text-to-speech). Returns a placeholder with generation parameters.",
    inputSchema: AudioGenerationInputSchema,
    outputSchema: GenerationOutputSchema,
    handler: async (input) => {
      const result = {
        status: "placeholder",
        text: input.text.slice(0, 100) + (input.text.length > 100 ? "..." : ""),
        voice: input.voice || "default",
        language: input.language || "en",
        message: "Audio generation requires external TTS service configuration. This is a placeholder response.",
        parameters: {
          model: "tts-1",
          response_format: "mp3",
          speed: 1.0,
        },
      };

      if (input.output_path) {
        await writeFile(input.output_path, JSON.stringify(result, null, 2));
        result.message += ` Parameters saved to: ${input.output_path}`;
      }

      return {
        status: result.status,
        message: result.message,
        parameters: result.parameters,
        outputPath: input.output_path,
      };
    },
  });

  const videoAnalysisTool = createReadOnlyTool({
    name: "VideoAnalysis",
    description: "Analyze video files and extract metadata. Supports MP4, WebM, AVI, MOV, MKV, FLV.",
    inputSchema: VideoAnalysisInputSchema,
    outputSchema: MediaAnalysisOutputSchema,
    handler: async (input) => {
      const videoPath = input.video_path;

      const fileStat = await stat(videoPath);
      const ext = videoPath.slice(videoPath.lastIndexOf(".")).toLowerCase();

      if (!VIDEO_EXTENSIONS.includes(ext)) {
        throw new Error(`Not a supported video format. Supported: ${VIDEO_EXTENSIONS.join(", ")}`);
      }

      const result: MediaAnalysisResult = {
        type: "video",
        format: ext.slice(1),
        size: fileStat.size,
        description: `Video file: ${ext.slice(1).toUpperCase()}, ${(fileStat.size / 1024 / 1024).toFixed(2)}MB`,
      };

      return result;
    },
  });

  const videoGenerationTool = createWriteTool({
    name: "VideoGeneration",
    description: "Generate video from text descriptions. Returns a placeholder with generation parameters.",
    inputSchema: VideoGenerationInputSchema,
    outputSchema: GenerationOutputSchema,
    handler: async (input) => {
      const result = {
        status: "placeholder",
        prompt: input.prompt,
        duration: input.duration || 5,
        resolution: input.resolution || "1080p",
        message: "Video generation requires external service configuration. This is a placeholder response.",
        parameters: {
          model: "video-gen-1",
          fps: 24,
          format: "mp4",
        },
      };

      if (input.output_path) {
        await writeFile(input.output_path, JSON.stringify(result, null, 2));
        result.message += ` Parameters saved to: ${input.output_path}`;
      }

      return {
        status: result.status,
        message: result.message,
        parameters: result.parameters,
        outputPath: input.output_path,
      };
    },
  });

  return [imageAnalysisTool, imageGenerationTool, audioAnalysisTool, audioGenerationTool, videoAnalysisTool, videoGenerationTool];
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
