import multer from 'multer';
import path from 'path';
import fs from 'fs';

/**
 * Multer configured with memory storage.
 * We handle writing to disk manually so we can use the commit_id in the filename.
 * Accepts a single file under field name "photo".
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|heic)$/i;
    const ext = path.extname(file.originalname);
    if (allowed.test(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${ext}`));
    }
  },
});

/**
 * Save an uploaded file buffer to storage/<projectId>/<commitId>.<ext>
 * Creates directories as needed. Returns the servable URL path.
 */
export function saveUploadedFile(
  file: Express.Multer.File,
  projectId: string,
  commitId: string,
  storagePath: string
): string {
  const ext = path.extname(file.originalname).toLowerCase();
  const dir = path.resolve(storagePath, projectId);
  const filename = `${commitId}${ext}`;
  const filePath = path.join(dir, filename);

  // Ensure directory exists
  fs.mkdirSync(dir, { recursive: true });

  // Write file
  fs.writeFileSync(filePath, file.buffer);

  // Return the URL path that the static middleware will serve
  return `/storage/${projectId}/${filename}`;
}

export default upload;
