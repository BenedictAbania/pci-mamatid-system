// compressImage: scales the longest side down (never up), re-encodes as JPEG, falls back to the original.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

let calls = [], size = { width: 4000, height: 3000 }, broken = false;
const manipulator = {
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
  ImageManipulator: {
    manipulate(uri) {
      if (broken) throw new Error('SYNTHETIC unsupported image');
      const ops = [];
      const context = {
        resize(target) { ops.push(target); return context; },
        async renderAsync() {
          const resized = ops.at(-1);
          const width = resized ? resized.width ?? Math.round(size.width * resized.height / size.height) : size.width;
          const height = resized ? resized.height ?? Math.round(size.height * resized.width / size.width) : size.height;
          return { width, height, async saveAsync(options) { calls.push({ uri, ops: [...ops], options, width, height }); return { uri: `file:///synthetic-compressed-${width}x${height}.jpg`, width, height }; } };
        },
      };
      return context;
    },
  },
};
const code = ts.transpileModule(fs.readFileSync('src/lib/utils/compress-image.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const context = { exports: {}, require: name => { if (name === 'expo-image-manipulator') return manipulator; throw new Error(name); } };
vm.runInNewContext(code, context);
const { compressImage, INSPECTION_PHOTO_COMPRESSION, PROFILE_PHOTO_COMPRESSION } = context.exports;
let checks = 0; const check = (value, message) => { assert.ok(value, message); checks++; };

check(await compressImage('file:///landscape.png', INSPECTION_PHOTO_COMPRESSION) === 'file:///synthetic-compressed-1600x1200.jpg', 'Landscape photo scales its width to 1600 px');
check(calls.at(-1).ops[0].width === 1600 && calls.at(-1).ops[0].height === null && calls.at(-1).options.format === 'jpeg' && calls.at(-1).options.compress === 0.72, 'Saved as JPEG at quality 0.72');
size = { width: 3000, height: 4000 };
check(await compressImage('file:///portrait.jpg', PROFILE_PHOTO_COMPRESSION) === 'file:///synthetic-compressed-384x512.jpg', 'Portrait profile photo scales its height to 512 px');
size = { width: 800, height: 600 };
await compressImage('file:///small.jpg', INSPECTION_PHOTO_COMPRESSION);
check(calls.at(-1).ops.length === 0 && calls.at(-1).width === 800, 'Small photos are never enlarged, only re-encoded');
broken = true;
check(await compressImage('file:///odd.heic', INSPECTION_PHOTO_COMPRESSION) === 'file:///odd.heic', 'Unprocessable images fall back to the original');
console.log(`Passed ${checks} image compression checks (synthetic image manipulator).`);
