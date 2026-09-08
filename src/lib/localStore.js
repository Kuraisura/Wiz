/**
 * Local File Store — Capacitor Filesystem + Preferences
 * Manages folders and files locally on the device.
 */
import { Filesystem as CapFilesystem, Directory as CapDirectory } from '@capacitor/filesystem';
import { Preferences as CapPreferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

let Filesystem = null;
let Preferences = null;
let Directory = null;
let isNative = false;

function initPlugins() {
  if (Filesystem) return;
  isNative = Capacitor.isNativePlatform();
  if (isNative) {
    Filesystem = CapFilesystem;
    Directory = CapDirectory;
    Preferences = CapPreferences;
    try { CapFilesystem.requestPermissions(); } catch {}
  }
}

async function getFS() {
  initPlugins();
  return Filesystem;
}

async function getPrefs() {
  initPlugins();
  return Preferences;
}

const FOLDERS_KEY = 'library-folders';
const FILES_KEY = 'library-files';
const BASE_DIR = 'Documents';
const APP_FOLDER = 'WizLibrary';

// ─── Helpers ───────────────────────────────────────────────

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function fileExt(name) {
  return (name.split('.').pop() || '').toLowerCase();
}

function fileTypeFromExt(ext) {
  const map = {
    pdf: 'PDF', doc: 'DOCX', docx: 'DOCX', ppt: 'PPTX', pptx: 'PPTX',
    epub: 'EPUB', jpg: 'Image', jpeg: 'Image', png: 'Image', gif: 'Image',
    webp: 'Image', mp4: 'Video', mp3: 'Audio',
  };
  return map[ext] || 'File';
}

// ─── Folder CRUD ───────────────────────────────────────────

export async function getFolders() {
  try {
    const P = await getPrefs();
    const result = await P.get({ key: FOLDERS_KEY });
    return result?.value ? JSON.parse(result.value) : [
      { id: 'default', name: 'My Files', created: Date.now() }
    ];
  } catch {
    return [{ id: 'default', name: 'My Files', created: Date.now() }];
  }
}

export async function saveFolders(folders) {
  try {
    const P = await getPrefs();
    await P.set({ key: FOLDERS_KEY, value: JSON.stringify(folders) });
  } catch {}
}

export async function createFolder(name) {
  const folders = await getFolders();
  const newFolder = {
    id: generateId(),
    name: name.trim(),
    created: Date.now(),
  };
  folders.push(newFolder);
  await saveFolders(folders);

  // Create the directory on filesystem
  try {
    const FS = await getFS();
    // Ensure parent directory exists
    try {
      await FS.mkdir({
        path: APP_FOLDER,
        directory: Directory.Data,
        recursive: true,
      });
    } catch {}
    await FS.mkdir({
      path: `${APP_FOLDER}/${newFolder.id}`,
      directory: Directory.Data,
      recursive: true,
    });
  } catch (err) {
    console.error('[LocalStore] Folder creation failed:', err);
  }

  return newFolder;
}

export async function renameFolder(id, newName) {
  const folders = await getFolders();
  const folder = folders.find(f => f.id === id);
  if (folder) {
    folder.name = newName.trim();
    await saveFolders(folders);
  }
  return folders;
}

export async function deleteFolder(id) {
  if (id === 'default') return await getFolders();
  const folders = await getFolders().then(fs => fs.filter(f => f.id !== id));
  await saveFolders(folders);

  // Delete the directory
  try {
    const FS = await getFS();
    await FS.rmdir({
      path: `${APP_FOLDER}/${id}`,
      directory: Directory.Data,
      recursive: true,
    });
  } catch {}

  // Remove files belonging to this folder from local store
  const files = await getLocalFiles();
  const remaining = files.filter(f => f.folderId !== id);
  await saveLocalFiles(remaining);

  return folders;
}

// ─── File CRUD ─────────────────────────────────────────────

export async function getLocalFiles() {
  try {
    const P = await getPrefs();
    const result = await P.get({ key: FILES_KEY });
    return result?.value ? JSON.parse(result.value) : [];
  } catch {
    return [];
  }
}

export async function saveLocalFiles(files) {
  try {
    const P = await getPrefs();
    await P.set({ key: FILES_KEY, value: JSON.stringify(files) });
  } catch {}
}

export async function addLocalFile(file, folderId = 'default') {
  const ext = fileExt(file.name);
  const record = {
    id: generateId(),
    name: file.name,
    type: fileTypeFromExt(ext),
    size: file.size,
    sizeDisplay: file.size >= 1024 * 1024
      ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
      : `${(file.size / 1024).toFixed(1)} KB`,
    folderId,
    created: Date.now(),
    mimeType: file.type || '',
  };

  // Save file to filesystem
  try {
    const FS = await getFS();
    // Ensure target directory exists
    try {
      await FS.mkdir({
        path: `${APP_FOLDER}/${folderId}`,
        directory: Directory.Data,
        recursive: true,
      });
    } catch {}
    const arrayBuffer = await file.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    const filePath = `${APP_FOLDER}/${folderId}/${record.id}_${file.name}`;
    await FS.writeFile({
      path: filePath,
      data: base64,
      directory: Directory.Data,
      encoding: undefined, // base64
    });

    record.path = filePath;
  } catch (err) {
    console.error('[LocalStore] File write failed:', err);
  }

  const files = await getLocalFiles();
  files.push(record);
  await saveLocalFiles(files);
  return record;
}

export async function deleteLocalFile(id) {
  const files = await getLocalFiles();
  const file = files.find(f => f.id === id);

  // Delete from filesystem
  if (file?.path) {
    try {
      const FS = await getFS();
      await FS.deleteFile({ path: file.path, directory: Directory.Data });
    } catch {}
  }

  const remaining = files.filter(f => f.id !== id);
  await saveLocalFiles(remaining);
  return remaining;
}

export async function moveLocalFile(fileId, newFolderId) {
  const files = await getLocalFiles();
  const file = files.find(f => f.id === fileId);
  if (!file) return files;

  const oldPath = file.path;
  const newPath = `${APP_FOLDER}/${newFolderId}/${file.id}_${file.name}`;

  // Move file on filesystem
  try {
    const FS = await getFS();
    // Read old file
    const content = await FS.readFile({ path: oldPath, directory: Directory.Data });
    // Write to new location
    await FS.writeFile({ path: newPath, data: content.data, directory: Directory.Data });
    // Delete old
    await FS.deleteFile({ path: oldPath, directory: Directory.Data });
    file.path = newPath;
  } catch (err) {
    console.error('[LocalStore] File move failed:', err);
  }

  file.folderId = newFolderId;
  await saveLocalFiles(files);
  return files;
}

export async function readFileContent(fileId) {
  const files = await getLocalFiles();
  const file = files.find(f => f.id === fileId);
  if (!file?.path) return null;

  try {
    const FS = await getFS();
    const result = await FS.readFile({ path: file.path, directory: Directory.Data });
    return result;
  } catch (err) {
    console.error('[LocalStore] Read failed:', err);
    return null;
  }
}

export async function getFilesByFolder(folderId) {
  const files = await getLocalFiles();
  if (folderId === 'all') return files;
  return files.filter(f => f.folderId === folderId);
}
