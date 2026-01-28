// debug-validation.ts
// Run: npx tsx src/modules/media/__test__/e2e/debug-validation.ts
// FIXED: Properly injects config instead of passing null

import { FileValidationService } from '../../services/file-validation.service.js';
import uploadConfig from 'src/config/upload.config.js';
import * as fs from 'fs';
import * as path from 'path';

import ffmpeg from 'fluent-ffmpeg';
import { path as ffprobePath } from 'ffprobe-static';

// ✅ CẤU HÌNH PATH CHO FFPROBE (Chỉ chạy khi debug local)
ffmpeg.setFfprobePath(ffprobePath);

async function testValidation() {
  // ✅ FIX: Load actual config instead of passing null
  const config = uploadConfig();

  const validator = new FileValidationService(config);

  // Initialize ClamAV (if enabled)
  await validator.onModuleInit();

  console.log('📋 Config loaded:');
  console.log('  - ClamAV Enabled:', config.clamav.enabled);
  console.log('  - Max Image Dimension:', config.limits.maxImageDimension);
  console.log('  - Max Video Duration:', config.limits.maxVideoDurationSeconds);
  console.log('');

  // Test 1: Real PNG
  console.log('=== Testing Real PNG ===');
  const pngPath = path.join(process.cwd(), 'test', 'Untitled.png');

  if (fs.existsSync(pngPath)) {
    const pngBuffer = fs.readFileSync(pngPath);
    const pngResult = await validator.validateBuffer(pngBuffer);
    console.log('PNG Result:', JSON.stringify(pngResult, null, 2));
  } else {
    console.log('❌ PNG file not found:', pngPath);
  }

  // Test 2: Real Video
  console.log('\n=== Testing Real Video ===');
  const videoPath = path.join(process.cwd(), 'test', 'test-video.mp4');

  if (fs.existsSync(videoPath)) {
    const videoResult = await validator.validateFileOnDisk(videoPath);
    console.log('Video Result:', JSON.stringify(videoResult, null, 2));
  } else {
    console.log('❌ Video file not found:', videoPath);
  }

  // Test 3: Real MP3
  console.log('\n=== Testing Real MP3 ===');
  const mp3Path = path.join(process.cwd(), 'test', 'test-audio.mp3');

  if (fs.existsSync(mp3Path)) {
    const mp3Result = await validator.validateFileOnDisk(mp3Path);
    console.log('MP3 Result:', JSON.stringify(mp3Result, null, 2));
  } else {
    console.log('❌ MP3 file not found:', mp3Path);
  }

  // Test 4: Real PDF
  console.log('\n=== Testing Real PDF ===');
  const pdfPath = path.join(process.cwd(), 'test', 'test-document.pdf');

  if (fs.existsSync(pdfPath)) {
    const pdfResult = await validator.validateFileOnDisk(pdfPath);
    console.log('PDF Result:', JSON.stringify(pdfResult, null, 2));
  } else {
    console.log('❌ PDF file not found:', pdfPath);
  }
}

testValidation().catch(console.error);
